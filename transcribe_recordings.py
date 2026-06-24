"""
downloads/ フォルダ内の音声ファイルを Whisper で文字起こしするスクリプト。

処理の流れ:
1. downloads/ 以下の .m4a / .mp4 ファイルを再帰的に探す
2. OpenAI の Whisper モデル（ローカル実行）で日本語文字起こし
3. transcripts/ フォルダに同名の .txt ファイルとして保存
4. 全ファイルをまとめた combined.txt も生成（NotebookLM への貼り付け用）

使い方:
    python3 transcribe_recordings.py [--model tiny|base|small|medium|large]

    --model を省略すると "small" を使う（精度と速度のバランスが良い）

モデルの選び方（精度が高いほど時間がかかる）:
    tiny   : 最速・最小。精度は低め。テスト用。
    base   : 速い。日本語はやや不安定。
    small  : バランス良し。日本語でも実用的。← デフォルト
    medium : 精度が高い。ただし時間がかかる。
    large  : 最高精度。GPU推奨。CPUだと非常に遅い。

事前準備:
    pip install openai-whisper
    ※ 初回実行時にモデルのデータ（数百MB〜数GB）が自動ダウンロードされます。

注意:
    CPUのみの環境では large モデルは1ファイルあたり数十分かかることがあります。
    まず tiny や small で試してから、精度が足りなければ上げてください。
"""
import argparse
import glob
import os
import sys


DOWNLOAD_DIR = "downloads"
TRANSCRIPT_DIR = "transcripts"
COMBINED_FILE = "combined.txt"
SUPPORTED_EXTS = {".m4a", ".mp4"}


def find_audio_files(download_dir: str) -> list[str]:
    """downloads/ 以下の音声ファイルを全て探す。年月フォルダも含む。"""
    files = []
    for ext in SUPPORTED_EXTS:
        files.extend(glob.glob(os.path.join(download_dir, "**", f"*{ext}"), recursive=True))
    return sorted(files)


def transcribe_file(audio_path: str, model, language: str = "ja") -> str:
    """Whisper で1ファイルを文字起こしして文字列で返す。"""
    result = model.transcribe(audio_path, language=language, verbose=False)
    return result["text"].strip()


def get_transcript_path(audio_path: str, transcript_dir: str) -> str:
    """音声ファイルパスから、対応するテキストファイルのパスを生成する。"""
    rel = os.path.relpath(audio_path, DOWNLOAD_DIR)
    txt_rel = os.path.splitext(rel)[0] + ".txt"
    return os.path.join(transcript_dir, txt_rel)


def main():
    parser = argparse.ArgumentParser(description="Whisper で Zoom 録画を文字起こしする")
    parser.add_argument(
        "--model",
        default="small",
        choices=["tiny", "base", "small", "medium", "large"],
        help="Whisper モデルサイズ（デフォルト: small）",
    )
    args = parser.parse_args()

    try:
        import whisper
    except ImportError:
        print(
            "エラー: whisper がインストールされていません。\n"
            "以下のコマンドでインストールしてください:\n"
            "    pip install openai-whisper",
            file=sys.stderr,
        )
        sys.exit(1)

    audio_files = find_audio_files(DOWNLOAD_DIR)
    if not audio_files:
        print(
            f"音声ファイルが見つかりません。先に download_recordings.py を実行してください。\n"
            f"探した場所: {os.path.abspath(DOWNLOAD_DIR)}/",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"音声ファイル数: {len(audio_files)} 件", file=sys.stderr)
    print(f"Whisper モデル: {args.model}（初回はモデルのダウンロードが入ります）", file=sys.stderr)

    print("モデルを読み込み中...", file=sys.stderr)
    model = whisper.load_model(args.model)
    print("モデル読み込み完了。文字起こし開始。", file=sys.stderr)

    os.makedirs(TRANSCRIPT_DIR, exist_ok=True)
    combined_parts = []

    for i, audio_path in enumerate(audio_files, 1):
        txt_path = get_transcript_path(audio_path, TRANSCRIPT_DIR)
        filename = os.path.basename(audio_path)

        if os.path.exists(txt_path):
            print(f"[{i}/{len(audio_files)}] スキップ（既存）: {filename}", file=sys.stderr)
            # 既存テキストも combined に含める
            with open(txt_path, encoding="utf-8") as f:
                content = f.read()
            combined_parts.append(content)
            continue

        print(f"[{i}/{len(audio_files)}] 文字起こし中: {filename}", file=sys.stderr)
        try:
            text = transcribe_file(audio_path, model)
        except Exception as e:
            print(f"  エラー: {e}", file=sys.stderr)
            continue

        os.makedirs(os.path.dirname(txt_path), exist_ok=True)
        # ファイル名をヘッダーとして先頭に付ける（NotebookLM で区別しやすくするため）
        header = f"=== {os.path.splitext(filename)[0]} ===\n"
        full_content = header + text + "\n"

        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(full_content)

        combined_parts.append(full_content)
        print(f"  保存: {txt_path}", file=sys.stderr)

    # まとめファイルを書き出す
    combined_path = os.path.join(TRANSCRIPT_DIR, COMBINED_FILE)
    with open(combined_path, "w", encoding="utf-8") as f:
        f.write("\n\n".join(combined_parts))

    print(f"\n完了！", file=sys.stderr)
    print(f"  個別ファイル: {TRANSCRIPT_DIR}/ 以下", file=sys.stderr)
    print(f"  まとめファイル: {combined_path}", file=sys.stderr)
    print(f"\nNotebookLM への取り込み方:", file=sys.stderr)
    print(f"  1. {combined_path} を開く", file=sys.stderr)
    print(f"  2. NotebookLM でノートブックを作成 → 「ソースを追加」→「ファイルをアップロード」", file=sys.stderr)
    print(f"  3. combined.txt を選択してアップロード", file=sys.stderr)


if __name__ == "__main__":
    main()
