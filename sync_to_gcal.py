"""
TimeTree → Google Calendar 同期スクリプト。

TimeTreeの予定をGoogleカレンダーに書き込む。
重複防止のため、イベントのextendedProperties.privateにsource_event_idを保存し、
同一IDが既に存在する場合はスキップする。

使い方:
    python3 sync_to_gcal.py [DAYS_AHEAD]
    例: python3 sync_to_gcal.py 14   # 今日から14日分を同期（デフォルト7日）

環境変数:
    TIMETREE_API_KEY      - TimeTree パーソナルアクセストークン（必須）
    TIMETREE_CALENDAR_ID  - 同期元のTimeTreeカレンダーID（必須）
    SYNC_CALENDAR_ID      - 同期先のGoogleカレンダーID（省略時: primary）
    GOOGLE_CLIENT_SECRET_FILE, GOOGLE_TOKEN_FILE
"""
import datetime
import os
import sys

from dotenv import load_dotenv

from calendar_client import GoogleCalendarClient
from timetree_client import load_timetree_client_from_env

load_dotenv()

SOURCE_ID_KEY = "source_event_id"


def already_synced(
    gcal: GoogleCalendarClient,
    calendar_id: str,
    unique_id: str,
    time_min: str,
    time_max: str,
) -> bool:
    existing = gcal.find_events_by_private_property(
        calendar_id=calendar_id,
        key=SOURCE_ID_KEY,
        value=unique_id,
        time_min=time_min,
        time_max=time_max,
    )
    return len(existing) > 0


def sync_timetree_event(
    gcal: GoogleCalendarClient,
    calendar_id: str,
    ev: dict,
    time_min: str,
    time_max: str,
) -> None:
    unique_id = f"timetree:{ev['id']}"

    if already_synced(gcal, calendar_id, unique_id, time_min, time_max):
        print(f"  スキップ（既存）: {ev['title']} @ {ev['start_at']}", file=sys.stderr)
        return

    gcal.create_event(
        calendar_id=calendar_id,
        summary=ev["title"],
        start_iso=ev["start_at"],
        end_iso=ev["end_at"],
        description=ev.get("description", ""),
        extended_properties={SOURCE_ID_KEY: unique_id},
    )
    print(f"  作成: {ev['title']} @ {ev['start_at']}", file=sys.stderr)


def main() -> None:
    days_ahead = int(sys.argv[1]) if len(sys.argv) >= 2 else 7

    jst = datetime.timezone(datetime.timedelta(hours=9))
    now = datetime.datetime.now(tz=jst)
    from_iso = now.strftime("%Y-%m-%dT00:00:00+09:00")
    until_iso = (now + datetime.timedelta(days=days_ahead)).strftime(
        "%Y-%m-%dT23:59:59+09:00"
    )

    timetree_api_key = os.environ.get("TIMETREE_API_KEY", "")
    timetree_calendar_id = os.environ.get("TIMETREE_CALENDAR_ID", "")
    if not timetree_api_key or not timetree_calendar_id:
        print(
            "エラー: TIMETREE_API_KEY と TIMETREE_CALENDAR_ID を .env に設定してください。",
            file=sys.stderr,
        )
        sys.exit(1)

    sync_calendar_id = os.environ.get("SYNC_CALENDAR_ID", "primary")
    client_secret_file = os.environ.get("GOOGLE_CLIENT_SECRET_FILE", "client_secret.json")
    token_file = os.environ.get("GOOGLE_TOKEN_FILE", "token.json")

    gcal = GoogleCalendarClient(client_secret_file, token_file)

    print(
        f"TimeTree同期開始: {from_iso} 〜 {until_iso}  同期先: {sync_calendar_id}",
        file=sys.stderr,
    )
    tt = load_timetree_client_from_env()
    events = tt.list_events(timetree_calendar_id, from_iso, until_iso)
    print(f"  TimeTree取得件数: {len(events)} 件", file=sys.stderr)

    for ev in events:
        sync_timetree_event(gcal, sync_calendar_id, ev, from_iso, until_iso)

    print("同期完了", file=sys.stderr)


if __name__ == "__main__":
    main()
