"""
Zoom録画とGoogleカレンダー予定を照合し、講師名を特定するスクリプト。

処理の流れ:
1. Googleスプレッドシート「やんけ」シートから講師名一覧を取得
   （例:「【レシピ】まさ」→「まさ」として抽出）
2. 指定期間のZoom録画一覧を取得
3. 各録画の開始時刻±30分のGoogleカレンダー予定を検索
4. カレンダー予定タイトルに講師名が含まれるか照合
5. 結果をCSV形式でコンソールに出力

使い方:
    python3 match_recordings.py [開始日] [終了日]
    例: python3 match_recordings.py 2026-05-01 2026-06-24

    引数を省略すると直近30日が対象になる。
"""
import csv
import datetime
import os
import sys

from dotenv import load_dotenv
from googleapiclient.discovery import build

from calendar_client import get_google_credentials
from zoom_client import load_zoom_client_from_env

load_dotenv()

WINDOW_MINUTES = 30

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
    matched = []
    combined = " ".join(event_titles)
    for name in instructors:
        if name in combined:
            matched.append(name)
    return matched


def parse_zoom_start_time(iso_str: str) -> datetime.datetime:
    """Zoomが返すISO8601文字列（UTC）をdatetimeに変換する。"""
    iso_str = iso_str.replace("Z", "+00:00")
    return datetime.datetime.fromisoformat(iso_str)


def main():
    today = datetime.date.today()
    if len(sys.argv) >= 3:
        from_date = sys.argv[1]
        to_date = sys.argv[2]
    else:
        from_date = (today - datetime.timedelta(days=30)).isoformat()
        to_date = today.isoformat()

    print(f"対象期間: {from_date} 〜 {to_date}", file=sys.stderr)

    client_secret_file = os.environ.get("GOOGLE_CLIENT_SECRET_FILE", "client_secret.json")
    token_file = os.environ.get("GOOGLE_TOKEN_FILE", "token.json")
    creds = get_google_credentials(client_secret_file, token_file)

    instructors = INSTRUCTORS
    print(f"講師名マスタ: {len(instructors)} 人", file=sys.stderr)

    print("Zoom録画一覧を取得中...", file=sys.stderr)
    zoom = load_zoom_client_from_env()
    recordings = zoom.list_recordings(from_date=from_date, to_date=to_date)
    print(f"録画数: {len(recordings)} 件", file=sys.stderr)

    cal_service = build("calendar", "v3", credentials=creds)

    writer = csv.writer(sys.stdout)
    writer.writerow(["録画ID", "録画日時(JST)", "会議名", "マッチした講師名", "マッチ結果"])

    jst = datetime.timezone(datetime.timedelta(hours=9))

    for meeting in recordings:
        recording_id = meeting.get("uuid", meeting.get("id", ""))
        topic = meeting.get("topic", "")
        start_time_str = meeting.get("start_time", "")

        if not start_time_str:
            continue

        start_dt_utc = parse_zoom_start_time(start_time_str)
        start_dt_jst = start_dt_utc.astimezone(jst)
        start_str_jst = start_dt_jst.strftime("%Y-%m-%d %H:%M")

        events = get_calendar_events_around(cal_service, start_dt_utc)
        titles = []
        for ev in events:
            title = ev.get("summary", "")
            if title:
                titles.append(title)

        matched = find_matching_instructors(titles, instructors)

        if matched:
            match_result = "マッチあり"
            matched_str = "／".join(matched)
        else:
            match_result = "マッチなし"
            matched_str = ""

        writer.writerow([recording_id, start_str_jst, topic, matched_str, match_result])


if __name__ == "__main__":
    main()
