#!/bin/bash
# Zoom文字起こしの自動同期スクリプト
# launchd から毎日呼び出される

cd ~/Desktop/zoom-project || exit 1

FROM_DATE=$(date -v-14d +%Y-%m-%d)
TO_DATE=$(date +%Y-%m-%d)

echo "[$(date)] 同期開始: $FROM_DATE 〜 $TO_DATE" >> ~/Desktop/zoom-project/auto_transcribe.log

/usr/bin/python3 sync_zoom_transcripts.py "$FROM_DATE" "$TO_DATE" >> ~/Desktop/zoom-project/auto_transcribe.log 2>&1

echo "[$(date)] 完了" >> ~/Desktop/zoom-project/auto_transcribe.log
