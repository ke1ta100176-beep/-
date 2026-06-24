"""
Zoom クラウド録画の音声ファイル（M4A）をローカルにダウンロードするスクリプト。

処理の流れ:
1. 指定期間の録画一覧を月ごとに取得（match_recordings.py と同じ方法）
2. 各録画から M4A ファイルを探してダウンロード
   ※ M4A がなければ MP4（音声入り動画）をダウンロード
3. downloads/ フォルダに保存
   ファイル名: YYYY-MM-DD_HHMMSS_会議名.m4a

使い方:
    python3 download_recordings.py [開始日] [終了日]
    例: python3 download_recordings.py 2025-12-01 2026-06-24

    引数を省略すると直近30日が対象になる。

注意:
    録画1件あたり数十〜数百MBになることがあります。
    629件全部ダウンロードすると数十GB以上になる可能性があるため、
    まず短い期間で試してから全件に広げることをおすすめします。
"""
import datetime
import os
import re
import sys

import requests
from dotenv import load_dotenv

from zoom_client import load_zoom_client_from_env
from match_recordings import split_into_monthly_ranges, parse_zoom_start_time

load_dotenv()

DOWNLOAD_DIR = "downloads"
PREFERRED_FILE_TYPES = ["M4A", "MP4"]  # M4A優先（音声のみ、容量が小さい）


def sanitize_filename(name: str) -> str:
    """ファイル名に使えない文字を除去する。"""
    return re.sub(r'[\\/:*?"<>|]', "_", name)


def download_file(url: str, dest_path: str, access_token: str) -> bool:
    """
    指定URLからファイルをダウンロードしてdest_pathに保存する。

    Zoom の録画ダウンロードには Bearer トークンが必要。
    既に同名ファイルがある場合はスキップする。
    """
    if os.path.exists(dest_path):
        print(f"  スキップ（既存）: {os.path.basename(dest_path)}", file=sys.stderr)
        return False

    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.get(url, headers=headers, stream=True, timeout=300)
    resp.raise_for_status()

    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    with open(dest_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=1024 * 1024):  # 1MB ずつ
            f.write(chunk)

    size_mb = os.path.getsize(dest_path) / (1024 * 1024)
    print(f"  保存完了: {os.path.basename(dest_path)} ({size_mb:.1f} MB)", file=sys.stderr)
    return True


def pick_audio_file(recording_files: list[dict]) -> dict | None:
    """
    録画ファイル一覧から音声ファイルを選ぶ。
    M4A → MP4 の優先順で最初に見つかったものを返す。
    """
    for preferred in PREFERRED_FILE_TYPES:
        for f in recording_files:
            if f.get("file_type", "").upper() == preferred and f.get("status") == "completed":
                return f
    return None


def main():
    today = datetime.date.today()
    if len(sys.argv) >= 3:
        from_date = datetime.date.fromisoformat(sys.argv[1])
        to_date = datetime.date.fromisoformat(sys.argv[2])
    else:
        from_date = today - datetime.timedelta(days=30)
        to_date = today

    print(f"対象期間: {from_date} 〜 {to_date}", file=sys.stderr)
    print(f"保存先: {os.path.abspath(DOWNLOAD_DIR)}/", file=sys.stderr)

    zoom = load_zoom_client_from_env()
    access_token = zoom._get_access_token()

    recordings = []
    for chunk_from, chunk_to in split_into_monthly_ranges(from_date, to_date):
        print(f"  {chunk_from} 〜 {chunk_to} を取得中...", file=sys.stderr)
        recordings.extend(zoom.list_recordings(from_date=chunk_from, to_date=chunk_to))
    print(f"録画数合計: {len(recordings)} 件", file=sys.stderr)

    jst = datetime.timezone(datetime.timedelta(hours=9))
    downloaded = 0
    skipped = 0
    no_audio = 0

    for i, meeting in enumerate(recordings, 1):
        start_time_str = meeting.get("start_time", "")
        topic = meeting.get("topic", "無題")
        recording_files = meeting.get("recording_files", [])

        if not start_time_str:
            continue

        start_dt_jst = parse_zoom_start_time(start_time_str).astimezone(jst)
        date_str = start_dt_jst.strftime("%Y-%m-%d")
        time_str = start_dt_jst.strftime("%H%M%S")
        safe_topic = sanitize_filename(topic)[:50]  # 長すぎるタイトルは切り捨て

        audio = pick_audio_file(recording_files)
        if not audio:
            print(f"[{i}/{len(recordings)}] 音声ファイルなし: {topic}", file=sys.stderr)
            no_audio += 1
            continue

        ext = audio.get("file_type", "MP4").lower()
        filename = f"{date_str}_{time_str}_{safe_topic}.{ext}"
        dest_path = os.path.join(DOWNLOAD_DIR, date_str[:7], filename)  # 年月フォルダに仕分け

        download_url = audio.get("download_url", "")
        if not download_url:
            print(f"[{i}/{len(recordings)}] URLなし: {topic}", file=sys.stderr)
            continue

        print(f"[{i}/{len(recordings)}] {topic}", file=sys.stderr)
        result = download_file(download_url, dest_path, access_token)
        if result:
            downloaded += 1
        else:
            skipped += 1

    print(
        f"\n完了: ダウンロード {downloaded} 件 / スキップ {skipped} 件 / 音声なし {no_audio} 件",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
