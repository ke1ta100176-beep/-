"""
Zoom録画とGoogleカレンダー予定を照合し、結果をスプレッドシートに書き出すスクリプト。

処理の流れ:
1. 指定期間のZoom録画一覧を取得（月ごとに分割してAPI制限を回避）
2. 各録画の開始時刻±30分のGoogleカレンダー予定を検索
3. カレンダー予定タイトルに講師名マスタが含まれるか照合
4. 結果を指定スプレッドシートの「録画ログ」シートに書き出す

スプレッドシートの列構成:
  A: 録画日時(JST)
  B: 会議名
  C: 講師名（自動）  ← マッチした場合のみ入力
  D: 講師名（手動）  ← マッチしなかった行を目視確認して手入力する欄
  E: 確定講師名      ← D優先、なければCを使うIF式が自動入力される

使い方:
    python3 match_recordings.py [開始日] [終了日]
    例: python3 match_recordings.py 2025-12-01 2026-06-24

    引数を省略すると直近30日が対象になる。

事前準備:
    .env に SPREADSHEET_ID=スプレッドシートのID を追記すること。
"""
import datetime
import os
import sys

from dotenv import load_dotenv
from googleapiclient.discovery import build

from calendar_client import get_google_credentials
from zoom_client import load_zoom_client_from_env

load_dotenv()

WINDOW_MINUTES = 30
OUTPUT_SHEET_NAME = "録画ログ"

# 「やんけ」シートのスクリーンショットから取得した講師名マスタ
INSTRUCTORS = [
    "テラ",
    "まっつ",
    "たびお",
    "みき",
    "Gaku",
    "りく",
    "REON",
    "カナノ",
    "あっくん",
    "エイミー",
    "りのま",
    "篠原敬至",
    "まひろ",
    "めう",
    "ゆうき",
    "あろ",
    "まさ",
]

HEADER = ["録画日時(JST)", "会議名", "講師名（自動）", "講師名（手動）", "確定講師名"]


def get_calendar_events_around(cal_service, dt_utc: datetime.datetime) -> list[dict]:
    """指定日時の前後WINDOW_MINUTES分のカレンダー予定を取得する。"""
    window = datetime.timedelta(minutes=WINDOW_MINUTES)
    time_min = (dt_utc - window).isoformat()
    time_max = (dt_utc + window).isoformat()
    resp = (
        cal_service.events()
        .list(
            calendarId="primary",
            timeMin=time_min,
            timeMax=time_max,
            singleEvents=True,
            orderBy="startTime",
        )
        .execute()
    )
    return resp.get("items", [])


def find_matching_instructors(event_titles: list[str], instructors: list[str]) -> list[str]:
    """カレンダー予定タイトル群の中に含まれる講師名を全て返す。"""
    combined = " ".join(event_titles)
    return [name for name in instructors if name in combined]


def parse_zoom_start_time(iso_str: str) -> datetime.datetime:
    """ZoomのISO8601文字列（UTC）をdatetimeに変換する。"""
    return datetime.datetime.fromisoformat(iso_str.replace("Z", "+00:00"))


def split_into_monthly_ranges(
    from_date: datetime.date, to_date: datetime.date
) -> list[tuple[str, str]]:
    """期間を1ヶ月以内のチャンクに分割する。Zoom APIの制限対応。"""
    ranges = []
    current = from_date
    while current <= to_date:
        if current.month == 12:
            next_month = current.replace(year=current.year + 1, month=1, day=1)
        else:
            next_month = current.replace(month=current.month + 1, day=1)
        chunk_end = min(next_month - datetime.timedelta(days=1), to_date)
        ranges.append((current.isoformat(), chunk_end.isoformat()))
        current = next_month
    return ranges


def ensure_sheet_exists(sheets_service, spreadsheet_id: str) -> None:
    """「録画ログ」シートがなければ作成する。"""
    meta = sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    existing = [s["properties"]["title"] for s in meta["sheets"]]
    if OUTPUT_SHEET_NAME not in existing:
        sheets_service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={"requests": [{"addSheet": {"properties": {"title": OUTPUT_SHEET_NAME}}}]},
        ).execute()
        print(f"シート「{OUTPUT_SHEET_NAME}」を新規作成しました。", file=sys.stderr)


def write_to_spreadsheet(sheets_service, spreadsheet_id: str, rows: list[list]) -> None:
    """ヘッダー＋データ行をスプレッドシートに書き込む。既存データは上書きする。"""
    ensure_sheet_exists(sheets_service, spreadsheet_id)

    # 既存データをクリア
    sheets_service.spreadsheets().values().clear(
        spreadsheetId=spreadsheet_id,
        range=f"{OUTPUT_SHEET_NAME}!A:E",
    ).execute()

    # ヘッダー＋データを書き込む
    all_rows = [HEADER] + rows
    sheets_service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f"{OUTPUT_SHEET_NAME}!A1",
        valueInputOption="USER_ENTERED",
        body={"values": all_rows},
    ).execute()

    print(f"スプレッドシートに {len(rows)} 行書き込みました。", file=sys.stderr)


def main():
    today = datetime.date.today()
    if len(sys.argv) >= 3:
        from_date = datetime.date.fromisoformat(sys.argv[1])
        to_date = datetime.date.fromisoformat(sys.argv[2])
    else:
        from_date = today - datetime.timedelta(days=30)
        to_date = today

    spreadsheet_id = os.environ.get("SPREADSHEET_ID", "")
    if not spreadsheet_id:
        print(
            "エラー: .env に SPREADSHEET_ID が設定されていません。\n"
            "スプレッドシートのURLから /d/★ここ★/edit の部分をコピーして追記してください。",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"対象期間: {from_date} 〜 {to_date}", file=sys.stderr)

    client_secret_file = os.environ.get("GOOGLE_CLIENT_SECRET_FILE", "client_secret.json")
    token_file = os.environ.get("GOOGLE_TOKEN_FILE", "token.json")
    creds = get_google_credentials(client_secret_file, token_file)

    print(f"講師名マスタ: {len(INSTRUCTORS)} 人", file=sys.stderr)

    print("Zoom録画一覧を取得中（月ごとに分割）...", file=sys.stderr)
    zoom = load_zoom_client_from_env()
    recordings = []
    for chunk_from, chunk_to in split_into_monthly_ranges(from_date, to_date):
        print(f"  {chunk_from} 〜 {chunk_to} を取得中...", file=sys.stderr)
        recordings.extend(zoom.list_recordings(from_date=chunk_from, to_date=chunk_to))
    print(f"録画数合計: {len(recordings)} 件", file=sys.stderr)

    cal_service = build("calendar", "v3", credentials=creds)
    sheets_service = build("sheets", "v4", credentials=creds)

    jst = datetime.timezone(datetime.timedelta(hours=9))
    rows = []

    for i, meeting in enumerate(recordings, 1):
        start_time_str = meeting.get("start_time", "")
        if not start_time_str:
            continue

        start_dt_utc = parse_zoom_start_time(start_time_str)
        start_dt_jst = start_dt_utc.astimezone(jst)
        start_str_jst = start_dt_jst.strftime("%Y-%m-%d %H:%M")
        topic = meeting.get("topic", "")

        events = get_calendar_events_around(cal_service, start_dt_utc)
        titles = [ev.get("summary", "") for ev in events if ev.get("summary")]
        matched = find_matching_instructors(titles, INSTRUCTORS)
        auto_name = "／".join(matched)

        # E列: 手動入力(D列)があればD優先、なければ自動(C列)を使うIF式
        confirm_formula = f'=IF(D{len(rows)+2}<>"",D{len(rows)+2},C{len(rows)+2})'

        rows.append([start_str_jst, topic, auto_name, "", confirm_formula])

        if i % 10 == 0:
            print(f"  カレンダー照合中... {i}/{len(recordings)} 件", file=sys.stderr)

    write_to_spreadsheet(sheets_service, spreadsheet_id, rows)
    print("完了！スプレッドシートを確認してください。", file=sys.stderr)


if __name__ == "__main__":
    main()
