"""
OBS WebSocket controller for cooking lecture group consultations.
Requires OBS 28+ with WebSocket server enabled (Tools > WebSocket Server Settings).
Install: pip install obsws-python
"""

import obsws_python as obs
import time
import sys

OBS_HOST = "localhost"
OBS_PORT = 4455
OBS_PASSWORD = ""  # Set in OBS WebSocket Server Settings

# Scene names — create these in OBS beforehand or use setup_scenes()
SCENES = {
    "zoom": "グルコン_Zoom画面",
    "camera_full": "グルコン_カメラ全画面",
}

# Cooking lecture flow: (scene_key, duration_seconds, label)
LECTURE_FLOW = [
    ("zoom", 0, "オープニング・自己紹介"),
    ("camera_full", 0, "料理実演"),
    ("zoom", 0, "質疑応答"),
    ("camera_full", 0, "仕上げ実演"),
    ("zoom", 0, "クロージング"),
]


def connect() -> obs.ReqClient:
    client = obs.ReqClient(host=OBS_HOST, port=OBS_PORT, password=OBS_PASSWORD, timeout=3)
    print(f"OBS接続成功: {client.get_version().obs_version}")
    return client


def switch_scene(client: obs.ReqClient, scene_key: str) -> None:
    scene_name = SCENES[scene_key]
    client.set_current_program_scene(scene_name)
    print(f"シーン切替 → {scene_name}")


def get_current_scene(client: obs.ReqClient) -> str:
    return client.get_current_program_scene().current_program_scene_name


def start_recording(client: obs.ReqClient) -> None:
    client.start_record()
    print("録画開始")


def stop_recording(client: obs.ReqClient) -> None:
    client.stop_record()
    print("録画停止")


def start_streaming(client: obs.ReqClient) -> None:
    client.start_stream()
    print("配信開始")


def stop_streaming(client: obs.ReqClient) -> None:
    client.stop_stream()
    print("配信停止")


def run_lecture_flow(client: obs.ReqClient) -> None:
    """Step through lecture scenes manually (press Enter to advance)."""
    print("\n=== 料理講座グルコン 進行コントロール ===")
    print("Enterキーで次のシーンへ、'q'で終了\n")

    for i, (scene_key, duration, label) in enumerate(LECTURE_FLOW):
        scene_name = SCENES[scene_key]
        print(f"[{i+1}/{len(LECTURE_FLOW)}] {label}")
        print(f"  シーン: {scene_name}")

        key = input("  → Enterで切替 ('q'で終了): ").strip().lower()
        if key == "q":
            print("進行を中断しました")
            break

        switch_scene(client, scene_key)

        if duration > 0:
            print(f"  {duration}秒後に自動で次へ...")
            time.sleep(duration)

    print("\n講座進行完了")


def setup_scenes(client: obs.ReqClient) -> None:
    """Create all required scenes in OBS if they don't exist."""
    existing = {s["sceneName"] for s in client.get_scene_list().scenes}

    for key, name in SCENES.items():
        if name not in existing:
            client.create_scene(name)
            print(f"シーン作成: {name}")
        else:
            print(f"シーン確認済: {name}")

    print("\nシーン設定完了。OBSで各シーンにソース（Zoomウィンドウ、カメラ等）を追加してください。")
    print_setup_guide()


def print_setup_guide() -> None:
    guide = """
=== OBSシーン設定ガイド ===

【グルコン_Zoom画面】
  - ソース追加: ウィンドウキャプチャ → Zoomウィンドウを選択

【グルコン_レシピ表示】
  - ソース追加: 画像 または ブラウザ → レシピPDF/画像ファイル
  - ソース追加: テキスト → 料理名・手順テキスト

【グルコン_カメラ+レシピ】
  - ソース追加: 映像キャプチャデバイス → 調理カメラ（画面右側）
  - ソース追加: 画像/ブラウザ → レシピ（画面左側）

【グルコン_カメラ全画面】
  - ソース追加: 映像キャプチャデバイス → 調理カメラ（全画面）

【グルコン_休憩画面】
  - ソース追加: 画像 → 休憩中の案内画像
  - ソース追加: テキスト → 「休憩中 〇分後に再開」

【OBS WebSocket有効化手順】
  1. OBS → ツール → WebSocketサーバー設定
  2. 「WebSocketサーバーを有効にする」にチェック
  3. ポート: 4455（デフォルト）
  4. パスワードを設定してこのファイルのOBS_PASSWORDに記入
"""
    print(guide)


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else "help"

    if command == "help":
        print("使い方:")
        print("  python obs_cooking_lecture.py setup    # OBSにシーンを自動作成")
        print("  python obs_cooking_lecture.py run      # 講座進行コントロール開始")
        print("  python obs_cooking_lecture.py scene <key>  # シーン切替 (zoom/recipe/camera_recipe/camera_full/break)")
        print("  python obs_cooking_lecture.py record start|stop  # 録画開始/停止")
        print("  python obs_cooking_lecture.py stream start|stop  # 配信開始/停止")
        return

    try:
        client = connect()
    except Exception as e:
        print(f"OBS接続エラー: {e}")
        print("OBSが起動しているか、WebSocketサーバーが有効か確認してください")
        print_setup_guide()
        sys.exit(1)

    if command == "setup":
        setup_scenes(client)
    elif command == "run":
        run_lecture_flow(client)
    elif command == "scene" and len(sys.argv) > 2:
        key = sys.argv[2]
        if key in SCENES:
            switch_scene(client, key)
        else:
            print(f"不明なシーンキー: {key}")
            print(f"使用可能: {list(SCENES.keys())}")
    elif command == "record" and len(sys.argv) > 2:
        if sys.argv[2] == "start":
            start_recording(client)
        elif sys.argv[2] == "stop":
            stop_recording(client)
    elif command == "stream" and len(sys.argv) > 2:
        if sys.argv[2] == "start":
            start_streaming(client)
        elif sys.argv[2] == "stop":
            stop_streaming(client)
    else:
        print(f"不明なコマンド: {command}")
        print("python obs_cooking_lecture.py help で使い方を確認してください")


if __name__ == "__main__":
    main()
