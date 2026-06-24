"""
Zoom Server-to-Server OAuth クライアント。

Zoom Marketplace で「Server-to-Server OAuth」アプリを作成し、
Account ID / Client ID / Client Secret を .env に設定してから使う。

参考: https://developers.zoom.us/docs/internal-apps/s2s-oauth/
"""
import base64
import os
import time

import requests

ZOOM_TOKEN_URL = "https://zoom.us/oauth/token"
ZOOM_API_BASE = "https://api.zoom.us/v2"


class ZoomClient:
    def __init__(self, account_id: str, client_id: str, client_secret: str):
        self.account_id = account_id
        self.client_id = client_id
        self.client_secret = client_secret
        self._access_token = None
        self._token_expires_at = 0

    def _get_access_token(self) -> str:
        """アクセストークンを取得する。有効期限内なら再利用する。"""
        if self._access_token and time.time() < self._token_expires_at - 60:
            return self._access_token

        credentials = f"{self.client_id}:{self.client_secret}"
        encoded = base64.b64encode(credentials.encode()).decode()

        resp = requests.post(
            ZOOM_TOKEN_URL,
            headers={"Authorization": f"Basic {encoded}"},
            params={
                "grant_type": "account_credentials",
                "account_id": self.account_id,
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()

        self._access_token = data["access_token"]
        self._token_expires_at = time.time() + data.get("expires_in", 3600)
        return self._access_token

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._get_access_token()}"}

    def test_connection(self) -> dict:
        """認証が通るかどうかを確認する。自分のユーザー情報を取得する。"""
        resp = requests.get(
            f"{ZOOM_API_BASE}/users/me", headers=self._headers(), timeout=30
        )
        resp.raise_for_status()
        return resp.json()

    def list_recordings(
        self, from_date: str, to_date: str, page_size: int = 30
    ) -> list[dict]:
        """
        指定期間のクラウド録画一覧を取得する（自分が主催した会議のみ）。

        from_date, to_date: "YYYY-MM-DD" 形式
        """
        all_meetings = []
        next_page_token = ""

        while True:
            params = {
                "from": from_date,
                "to": to_date,
                "page_size": page_size,
            }
            if next_page_token:
                params["next_page_token"] = next_page_token

            resp = requests.get(
                f"{ZOOM_API_BASE}/users/me/recordings",
                headers=self._headers(),
                params=params,
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()

            all_meetings.extend(data.get("meetings", []))
            next_page_token = data.get("next_page_token", "")
            if not next_page_token:
                break

        return all_meetings


def load_zoom_client_from_env() -> ZoomClient:
    account_id = os.environ["ZOOM_ACCOUNT_ID"]
    client_id = os.environ["ZOOM_CLIENT_ID"]
    client_secret = os.environ["ZOOM_CLIENT_SECRET"]
    return ZoomClient(account_id, client_id, client_secret)
