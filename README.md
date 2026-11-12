# TOE Effect Camera

TouchDesigner の .toe プロジェクトに入っている TOP ネットワークを、ブラウザ（WebGL2）でリアルタイムに再現するエフェクトカメラです。

**▶ https://toruma00-debug.github.io/toe-effect-camera/**

- カメラ映像に 17 種類のプリセットを適用（「入力」から動画・画像ファイルやデモ映像にも切り替え可）
- マイク入力で音に反応するプリセットあり（TDwixtor、audio_visual1030、geo）
- 写真撮影・録画
- 「ネットワーク」パネルで各ノードの出力表示とパラメータ調整
- 手元の .toe / .tox をドラッグ&ドロップすると、その場で読み込んで実行

カメラとマイクは HTTPS のページでのみ使えます。ブラウザは Chrome / Edge / Safari の最新版を想定しています。

## 仕組み

1. .toe（TEA-ECB で包まれた zlib ストリーム）をブラウザ内で展開し、オペレーター・接続・パラメータ・エクスプレッションを取り出す
2. TOP を約 40 種類のシェーダーに対応させ、毎フレーム評価する（Level / Composite / Noise / Blur / Edge / Displace / Feedback / Time Machine など）
3. CHOP（LFO・Math・音声解析など）と簡単なパラメータ式（`op('lfo1')['chan1']`、`absTime.seconds` など）を評価する

TouchDesigner の出力と完全には一致しない近似です。Render TOP（3D）は点群・走査線・ワイヤーフレームなど用途別の描画に置き換えています。

## クレジット

- TDwixtor プリセット: uisato 氏の「Realtime Audioreactive Time Remap」プロジェクトの設定値に基づいています
- .toe コンテナの形式は [WebToe の TOE-FORMAT.md](https://github.com/frank890417/WebToe/blob/main/docs/TOE-FORMAT.md) の記述を参照しました

TouchDesigner は Derivative Inc. の製品です。本ページは Derivative とは関係ありません。
