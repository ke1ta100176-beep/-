"""
Zoom API と Google Calendar API の両方の認証が通るかを確認するスクリプト。

実行前にやること:
1. .env.example を .env にコピーして、Zoomの認証情報を埋める
2. Google Cloud Console で取得した client_secret.json をこのディレクトリに置く
3. pip install -r requirements.txt --break-system-packages
4. python test_auth.py

成功すると、Zoomのユーザー情報・直近のクラウド録画数・
Googleカレンダーの予定の一部が表示される。
"""
import datetime
import sys

from dotenv import load_dotenv

from calendar_client import GoogleCalendarClient
from zoom_client import load_zoom_client_from_env

load_dotenv()


def test_zoom() -> bool:
    print("=" * 60)
    print("[1/2] Zoom API 接続テスト")
    print("=" * 60)
    try:
        client = load_zoom_client_from_env()
        me = client.test_connection()
        print(f"✅ Zoom認証成功: {me.get('email')} (ID: {me.get('id')})")

        # 直近30日のクラウド録画件数も確認する
        today = datetime.date.today()
        thirty_days_ago = today - datetime.timedelta(days=30)
        recordings = client.list_recordings(
            from_date=thirty_days_ago.isoformat(), to_date=today.isoformat()
        )
        print(f"✅ 直近30日のクラウド録画: {len(recordings)} 件")
        if recordings:
            sample = recordings[0]
            print(
                f"   例: {sample.get('topic')} "
                f"({sample.get('start_time')})"
            )
        return True
    except KeyError as e:
        print(f"❌ .envに環境変数が不足しています: {e}")
        return False
    except Exception as e:
        print(f"❌ Zoom API接続に失敗しました: {e}")
        return False


def test_google_calendar() -> bool:
    print()
    print("=" * 60)
    print("[2/2] Google Calendar API 接続テスト")
    print("=" * 60)
    try:
        client = GoogleCalendarClient(
            client_secret_file="client_secret.json",
            token_file="token.json",
        )
        calendars = client.test_connection()
        print(f"✅ Google認証成功。カレンダー数: {len(calendars.get('items', []))}")

        now = datetime.datetime.now(datetime.timezone.utc)
        thirty_days_ago = now - datetime.timedelta(days=30)
        events = client.list_events(
            time_min_iso=thirty_days_ago.isoformat(),
            time_max_iso=now.isoformat(),
        )
        print(f"✅ 直近30日の予定: {len(events)} 件")
        if events:
            sample = events[0]
            start = sample.get("start", {}).get(
                "dateTime", sample.get("start", {}).get("date")
            )
            print(f"   例: {sample.get('summary')} ({start})")
        return True
    except FileNotFoundError as e:
        print(f"❌ ファイルが見つかりません: {e}")
        print(
            "   Google Cloud Console で取得した client_secret.json を"
            " このディレクトリに置いてください"
        )
        return False
    except Exception as e:
        print(f"❌ Google Calendar API接続に失敗しました: {e}")
        return False


if __name__ == "__main__":
    zoom_ok = test_zoom()
    google_ok = test_google_calendar()

    print()
    print("=" * 60)
    if zoom_ok and google_ok:
        print("🎉 両方の認証が通りました。次のステップに進めます。")
    else:
        print("⚠️  まだ認証が通っていない箇所があります。上記のエラーを確認してください。")
        sys.exit(1)
