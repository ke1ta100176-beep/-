#!/bin/bash
# Zoom録画の自動ダウンロード＆文字起こしスクリプト
# launchd から毎日呼び出される

# プロジェクトフォルダに移動
cd ~/Desktop/zoom-project || exit 1

# 直近7日分を対象にダウンロード（重複はスキップされる）
FROM_DATE=$(date -v-7d +%Y-%m-%d)
TO_DATE=$(date +%Y-%m-%d)

echo "[$(date)] ダウンロード開始: $FROM_DATE 〜 $TO_DATE" >> ~/Desktop/zoom-project/auto_transcribe.log

/usr/bin/python3 download_recordings.py "$FROM_DATE" "$TO_DATE" >> ~/Desktop/zoom-project/auto_transcribe.log 2>&1

echo "[$(date)] 文字起こし開始" >> ~/Desktop/zoom-project/auto_transcribe.log

/usr/bin/python3 transcribe_recordings.py --model small >> ~/Desktop/zoom-project/auto_transcribe.log 2>&1

echo "[$(date)] 完了" >> ~/Desktop/zoom-project/auto_transcribe.log
