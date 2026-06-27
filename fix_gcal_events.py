"""
Googleカレンダーのイベントを整理するスクリプト。

処理内容:
1. タイトルが「14アロ」のように数字で始まる予定を正しい時刻に移動する
2. 同じ日・同じタイトルの予定が重複している場合は全件削除する

使い方:
    python3 fix_gcal_events.py           # ドライラン（確認のみ、変更しない）
    python3 fix_gcal_events.py --apply   # 実際に変更を適用する

注意: 必ず先にドライランで変更予定内容を確認してから --apply を実行すること。
"""
import datetime
import os
import re
import sys
from collections import defaultdict

from dotenv import load_dotenv

from calendar_client import GoogleCalendarClient

load_dotenv()

JST = datetime.timezone(datetime.timedelta(hours=9))


def parse_hour_from_title(title: str):
    """「14アロ」→ 14、「9まさ」→ 9、「ヤンケF組」→ None"""
    m = re.match(r"^(\d{1,2})", title)
    if m:
        h = int(m.group(1))
        return h if 0 <= h <= 23 else None
    return None


def get_event_date_jst(event: dict):
    """イベントの日付（JST）を返す。"""
    start = event.get("start", {})
    if "dateTime" in start:
        dt = datetime.datetime.fromisoformat(start["dateTime"])
        return dt.astimezone(JST).date()
    if "date" in start:
        return datetime.date.fromisoformat(start["date"])
    return None


def get_event_hour_jst(event: dict):
    """時刻付きイベントのJST時（hour）を返す。終日イベントはNone。"""
    start = event.get("start", {})
    if "dateTime" in start:
        dt = datetime.datetime.fromisoformat(start["dateTime"])
        return dt.astimezone(JST).hour
    return None


def calc_new_times(event: dict, correct_hour: int):
    """
    正しい時刻に変更した場合の (start_iso, end_iso) を返す。
    - 時刻付きイベント: 所要時間を保持して時刻だけ変更
    - 終日イベント: 1時間のイベントに変換
    """
    start = event.get("start", {})
    end = event.get("end", {})

    if "dateTime" in start:
        start_dt = datetime.datetime.fromisoformat(start["dateTime"]).astimezone(JST)
        end_dt = datetime.datetime.fromisoformat(end["dateTime"]).astimezone(JST)
        duration = end_dt - start_dt
        new_start = start_dt.replace(hour=correct_hour, minute=0, second=0, microsecond=0)
        new_end = new_start + duration
    else:
        date = datetime.date.fromisoformat(start["date"])
        new_start = datetime.datetime(date.year, date.month, date.day, correct_hour, 0, 0, tzinfo=JST)
        new_end = new_start + datetime.timedelta(hours=1)

    return new_start.isoformat(), new_end.isoformat()


def main() -> None:
    apply_mode = "--apply" in sys.argv

    if not apply_mode:
        print("=" * 60)
        print("ドライランモード（実際の変更は行いません）")
        print("変更を適用するには: python3 fix_gcal_events.py --apply")
        print("=" * 60)
        print()

    client_secret_file = os.environ.get("GOOGLE_CLIENT_SECRET_FILE", "client_secret.json")
    token_file = os.environ.get("GOOGLE_TOKEN_FILE", "token.json")
    calendar_id = os.environ.get("SYNC_CALENDAR_ID", "primary")

    gcal = GoogleCalendarClient(client_secret_file, token_file)

    print("全イベントを取得中...", file=sys.stderr)
    events = gcal.list_all_events(calendar_id=calendar_id)
    print(f"取得件数: {len(events)} 件\n", file=sys.stderr)

    # ── 重複グループを特定 ──
    groups: dict = defaultdict(list)
    for ev in events:
        title = ev.get("summary", "").strip()
        date = get_event_date_jst(ev)
        if title and date:
            groups[(title, date)].append(ev)

    duplicate_ids: set = set()
    duplicate_count = 0
    for (title, date), evs in groups.items():
        if len(evs) >= 2:
            for ev in evs:
                duplicate_ids.add(ev["id"])
            duplicate_count += 1
            print(f"[重複・全削除] {date} 「{title}」× {len(evs)}件")

    # ── 時刻修正対象を特定（重複でないもののみ） ──
    time_fixes: list = []
    for ev in events:
        if ev["id"] in duplicate_ids:
            continue
        title = ev.get("summary", "").strip()
        correct_hour = parse_hour_from_title(title)
        if correct_hour is None:
            continue
        current_hour = get_event_hour_jst(ev)
        date = get_event_date_jst(ev)
        is_allday = "dateTime" not in ev.get("start", {})
        if is_allday or current_hour != correct_hour:
            new_start, new_end = calc_new_times(ev, correct_hour)
            time_fixes.append((ev, new_start, new_end))
            tag = "終日→時刻付きに変換" if is_allday else f"{current_hour}時 → {correct_hour}時"
            print(f"[時刻修正] {date} 「{title}」{tag}")

    print()
    print(f"重複削除: {len(duplicate_ids)} 件（{duplicate_count} グループ）")
    print(f"時刻修正: {len(time_fixes)} 件")

    if not apply_mode:
        print()
        print("変更を適用するには: python3 fix_gcal_events.py --apply")
        return

    # ── 実行 ──
    print("\n変更を適用中...")

    deleted = 0
    for event_id in duplicate_ids:
        gcal.delete_event(calendar_id, event_id)
        deleted += 1
        if deleted % 10 == 0:
            print(f"  削除中... {deleted}/{len(duplicate_ids)}", file=sys.stderr)
    print(f"削除完了: {deleted} 件")

    fixed = 0
    for ev, new_start, new_end in time_fixes:
        gcal.patch_event_time(calendar_id, ev["id"], new_start, new_end)
        fixed += 1
        if fixed % 10 == 0:
            print(f"  修正中... {fixed}/{len(time_fixes)}", file=sys.stderr)
    print(f"時刻修正完了: {fixed} 件")

    print("\n全て完了しました。Googleカレンダーを確認してください。")


if __name__ == "__main__":
    main()
