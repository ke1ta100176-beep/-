"""
Zoom の自動文字起こしファイル（VTT）をダウンロードし、
2週間単位のフォルダに整理して Google ドライブにアップロードするスクリプト。

処理の流れ:
1. 指定期間の録画一覧を取得
2. 各録画から TRANSCRIPT ファイル（VTT形式）を探してダウンロード
3. 録画日時から「2週間バケット」を計算（例: 2026-06-15_2026-06-28）
4. Google ドライブの対応フォルダにアップロード
   ※フォルダがなければ自動作成

使い方:
    python3 sync_zoom_transcripts.py [開始日] [終了日]
    例: python3 sync_zoom_transcripts.py 2025-12-01 2026-06-26

    引数を省略すると直近14日が対象になる。

Google ドライブのフォルダ構成:
    Zoom文字起こし/
    ├── 2026-06-15_2026-06-28/
    │   ├── 2026-06-16_100034_やんけのパーソナルミーティングルーム.vtt
    │   └── ...
    ├── 2026-06-01_2026-06-14/
    │   └── ...
    └── ...

.env に追加する設定:
    DRIVE_ROOT_FOLDER_NAME=Zoom文字起こし   # ドライブ上のルートフォルダ名（任意）
"""
import datetime
import os
import re
import sys

import requests
from dotenv import load_dotenv
from googleapiclient.discovery import build
from googleapiclient.http import MediaInMemoryUpload

from calendar_client import get_google_credentials
from zoom_client import load_zoom_client_from_env
from match_recordings import split_into_monthly_ranges, parse_zoom_start_time

load_dotenv()

DRIVE_ROOT_FOLDER_NAME = os.environ.get("DRIVE_ROOT_FOLDER_NAME", "Zoom文字起こし")
BIWEEKLY_ANCHOR = datetime.date(2025, 1, 6)  # 2週間バケットの起点（月曜日）


def get_biweekly_bucket(recording_date: datetime.date) -> tuple[datetime.date, datetime.date]:
    """
    録画日から2週間バケットの開始日・終了日を返す。
    BIWEEKLY_ANCHOR を起点に14日ごとに区切る。
    """
    days_since_anchor = (recording_date - BIWEEKLY_ANCHOR).days
    bucket_index = days_since_anchor // 14
    bucket_start = BIWEEKLY_ANCHOR + datetime.timedelta(days=bucket_index * 14)
    bucket_end = bucket_start + datetime.timedelta(days=13)
    return bucket_start, bucket_end


def bucket_folder_name(start: datetime.date, end: datetime.date) -> str:
    return f"{start.isoformat()}_{end.isoformat()}"


def sanitize_filename(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|]', "_", name)


def get_or_create_folder(drive_service, name: str, parent_id: str | None = None) -> str:
    """
    Google ドライブに指定名のフォルダがあればそのIDを、なければ作成してIDを返す。
    """
    query = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id:
        query += f" and '{parent_id}' in parents"

    resp = drive_service.files().list(q=query, fields="files(id, name)").execute()
    files = resp.get("files", [])
    if files:
        return files[0]["id"]

    metadata = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
    }
    if parent_id:
        metadata["parents"] = [parent_id]

    folder = drive_service.files().create(body=metadata, fields="id").execute()
    print(f"  フォルダ作成: {name}", file=sys.stderr)
    return folder["id"]


def file_exists_in_folder(drive_service, filename: str, folder_id: str) -> bool:
    """指定フォルダに同名ファイルがあれば True を返す。"""
    query = f"name='{filename}' and '{folder_id}' in parents and trashed=false"
    resp = drive_service.files().list(q=query, fields="files(id)").execute()
    return len(resp.get("files", [])) > 0


def upload_to_drive(drive_service, filename: str, content: bytes, folder_id: str) -> str:
    """ファイルを Google ドライブの指定フォルダにアップロードしてファイルIDを返す。"""
    metadata = {"name": filename, "parents": [folder_id]}
    media = MediaInMemoryUpload(content, mimetype="text/vtt", resumable=False)
    file = drive_service.files().create(
        body=metadata, media_body=media, fields="id"
    ).execute()
    return file["id"]


def download_transcript(url: str, access_token: str) -> bytes | None:
    """Zoom の VTT ファイルをダウンロードしてバイト列で返す。失敗したら None。"""
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.get(url, headers=headers, timeout=60)
    if resp.status_code == 200:
        return resp.content
    return None


def main():
    today = datetime.date.today()
    if len(sys.argv) >= 3:
        from_date = datetime.date.fromisoformat(sys.argv[1])
        to_date = datetime.date.fromisoformat(sys.argv[2])
    else:
        from_date = today - datetime.timedelta(days=14)
        to_date = today

    print(f"対象期間: {from_date} 〜 {to_date}", file=sys.stderr)
    print(f"ドライブルートフォルダ: {DRIVE_ROOT_FOLDER_NAME}", file=sys.stderr)

    client_secret_file = os.environ.get("GOOGLE_CLIENT_SECRET_FILE", "client_secret.json")
    token_file = os.environ.get("GOOGLE_TOKEN_FILE", "token.json")
    creds = get_google_credentials(client_secret_file, token_file)
    drive_service = build("drive", "v3", credentials=creds)

    zoom = load_zoom_client_from_env()
    access_token = zoom._get_access_token()

    recordings = []
    for chunk_from, chunk_to in split_into_monthly_ranges(from_date, to_date):
        print(f"  {chunk_from} 〜 {chunk_to} を取得中...", file=sys.stderr)
        recordings.extend(zoom.list_recordings(from_date=chunk_from, to_date=chunk_to))
    print(f"録画数合計: {len(recordings)} 件", file=sys.stderr)

    jst = datetime.timezone(datetime.timedelta(hours=9))
    root_folder_id = get_or_create_folder(drive_service, DRIVE_ROOT_FOLDER_NAME)

    uploaded = 0
    skipped = 0
    no_transcript = 0

    for i, meeting in enumerate(recordings, 1):
        start_time_str = meeting.get("start_time", "")
        topic = meeting.get("topic", "無題")
        recording_files = meeting.get("recording_files", [])

        if not start_time_str:
            continue

        start_dt_jst = parse_zoom_start_time(start_time_str).astimezone(jst)
        recording_date = start_dt_jst.date()
        date_str = start_dt_jst.strftime("%Y-%m-%d")
        time_str = start_dt_jst.strftime("%H%M%S")
        safe_topic = sanitize_filename(topic)[:50]

        # TRANSCRIPT ファイルを探す
        transcript_file = next(
            (f for f in recording_files
             if f.get("file_type", "").upper() == "TRANSCRIPT"
             and f.get("status") == "completed"),
            None,
        )
        if not transcript_file:
            print(f"[{i}/{len(recordings)}] 文字起こしなし: {topic}", file=sys.stderr)
            no_transcript += 1
            continue

        filename = f"{date_str}_{time_str}_{safe_topic}.vtt"
        bucket_start, bucket_end = get_biweekly_bucket(recording_date)
        folder_name = bucket_folder_name(bucket_start, bucket_end)

        # 2週間フォルダを取得/作成
        bucket_folder_id = get_or_create_folder(drive_service, folder_name, root_folder_id)

        # 既存ファイルチェック
        if file_exists_in_folder(drive_service, filename, bucket_folder_id):
            print(f"[{i}/{len(recordings)}] スキップ（既存）: {filename}", file=sys.stderr)
            skipped += 1
            continue

        print(f"[{i}/{len(recordings)}] アップロード中: {filename}", file=sys.stderr)
        download_url = transcript_file.get("download_url", "")
        content = download_transcript(download_url, access_token)
        if not content:
            print(f"  ダウンロード失敗: {filename}", file=sys.stderr)
            continue

        upload_to_drive(drive_service, filename, content, bucket_folder_id)
        print(f"  → ドライブ/{DRIVE_ROOT_FOLDER_NAME}/{folder_name}/{filename}", file=sys.stderr)
        uploaded += 1

    print(
        f"\n完了: アップロード {uploaded} 件 / スキップ {skipped} 件 / 文字起こしなし {no_transcript} 件",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
