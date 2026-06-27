"""
TimeTree API クライアント。

事前準備:
    https://timetreeapp.com/personal_access_tokens でパーソナルアクセストークンを発行し、
    .env に TIMETREE_API_KEY=<トークン> を追記する。

参考: https://developers.timetreeapp.com/
"""
import os

import requests
from dotenv import load_dotenv

load_dotenv()

TIMETREE_API_BASE = "https://timetreeapis.com"


class TimeTreeClient:
    def __init__(self, api_key: str):
        self.api_key = api_key

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/vnd.timetree.v1+json",
        }

    def list_calendars(self) -> list[dict]:
        """カレンダー一覧を返す。TIMETREE_CALENDAR_ID の確認に使う。"""
        resp = requests.get(
            f"{TIMETREE_API_BASE}/calendars",
            headers=self._headers(),
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json().get("data", [])

    def list_events(
        self,
        calendar_id: str,
        from_iso: str,
        until_iso: str,
        timezone: str = "Asia/Tokyo",
    ) -> list[dict]:
        """
        指定期間のイベントを返す。

        from_iso, until_iso: "2026-06-27T00:00:00+09:00" 形式
        返却値: [{"id": ..., "title": "14アロ", "start_at": "...", "end_at": "...", "description": ""}]
        """
        resp = requests.get(
            f"{TIMETREE_API_BASE}/calendars/{calendar_id}/events",
            headers=self._headers(),
            params={"timezone": timezone, "from": from_iso, "until": until_iso},
            timeout=30,
        )
        resp.raise_for_status()
        raw_list = resp.json().get("data", [])
        return [self._normalize(ev) for ev in raw_list]

    def _normalize(self, raw: dict) -> dict:
        attrs = raw.get("attributes", {})
        return {
            "id": raw["id"],
            "title": attrs.get("title", ""),
            "start_at": attrs.get("start_at", ""),
            "end_at": attrs.get("end_at", ""),
            "description": attrs.get("note", ""),
        }


def load_timetree_client_from_env() -> TimeTreeClient:
    return TimeTreeClient(api_key=os.environ["TIMETREE_API_KEY"])


if __name__ == "__main__":
    client = load_timetree_client_from_env()
    calendars = client.list_calendars()
    print("カレンダー一覧:")
    for cal in calendars:
        cal_id = cal["id"]
        name = cal.get("attributes", {}).get("name", "")
        print(f"  ID: {cal_id}  名前: {name}")
