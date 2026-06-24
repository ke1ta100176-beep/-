"""
Google Calendar API クライアント（OAuth, デスクトップアプリ向け）。

初回実行時にブラウザが開き、Googleアカウントでの許可を求められる。
許可後は token.json にリフレッシュトークンが保存され、以後は自動更新される。

参考: https://developers.google.com/calendar/api/quickstart/python
"""
import os

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# 必要な権限。後でDrive/Sheetsも使う前提でまとめて要求しておく。
SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets.readonly",
]


def get_google_credentials(
    client_secret_file: str, token_file: str
) -> Credentials:
    creds = None
    if os.path.exists(token_file):
        creds = Credentials.from_authorized_user_file(token_file, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                client_secret_file, SCOPES
            )
            creds = flow.run_local_server(port=0)
        with open(token_file, "w") as f:
            f.write(creds.to_json())

    return creds


class GoogleCalendarClient:
    def __init__(self, client_secret_file: str, token_file: str):
        creds = get_google_credentials(client_secret_file, token_file)
        self.service = build("calendar", "v3", credentials=creds)

    def test_connection(self) -> dict:
        """認証が通るかどうかを確認する。カレンダー一覧を取得する。"""
        return self.service.calendarList().list(maxResults=5).execute()

    def list_events(
        self, time_min_iso: str, time_max_iso: str, calendar_id: str = "primary"
    ) -> list[dict]:
        """
        指定期間の予定一覧を取得する。

        time_min_iso, time_max_iso: "2026-06-01T00:00:00+09:00" のようなISO8601形式
        """
        events = []
        page_token = None

        while True:
            resp = (
                self.service.events()
                .list(
                    calendarId=calendar_id,
                    timeMin=time_min_iso,
                    timeMax=time_max_iso,
                    singleEvents=True,
                    orderBy="startTime",
                    pageToken=page_token,
                )
                .execute()
            )
            events.extend(resp.get("items", []))
            page_token = resp.get("nextPageToken")
            if not page_token:
                break

        return events
