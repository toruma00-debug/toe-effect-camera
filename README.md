# TOE Effect Camera

ブラウザ（WebGL2）で動くリアルタイムのエフェクトカメラです。TouchDesigner の .toe に入っている TOP ネットワークをそのまま実行できるエンジンの上に、オリジナルのプリセットを 120 種類のせています。

**▶ https://toruma00-debug.github.io/toe-effect-camera/**

## プリセット

6 つのフォルダに 20 種類ずつ、合計 120 種類です。

| フォルダ | 方向性 | 例 |
|---|---|---|
| FILM | フィルムとアナログの質感 | Amber 400 / Halation / Super 8 / VHS Rental / Film Look |
| GLITCH | デジタルの乱れと信号 | Datamosh / Pixel Stretch / Pixelate / Thermal / Hologram |
| LIGHT | 光・グロー・残像 | Neon Edge / Light Trails / Prism / God Rays / Blacklight |
| GRAPHIC | 印刷とイラストレーション | Halftone / Risograph / Toon / Oil Paint / Blueprint |
| SPACE | 歪み・時間・立体 | Kaleido / Slit Scan / Time Melt / Point Cloud / Infinity Mirror |
| SENSOR | 追跡・サーマル・時間のずれ | Tracker / Motion Boxes / Constellation / Ironbow / Scanner |

♪ の付いたプリセットは音に反応します（マイクを使わないときは 120BPM のオートビート）。

## 使い方

- 下のフォルダ名とプリセット名をタップ、または画面を左右にスワイプで切り替え（上下スワイプでフォルダ移動）
- 画面を長押しすると、押している間だけ元の映像を表示
- **Library**：120 種類の一覧とお気に入り　**Adjust**：かかり具合と各パラメータ　右上：入力・音・画質などの設定
- **Photo / Video** を選んでシャッター。撮影後に保存・共有
- キーボード：← → でプリセット、↑ ↓ でフォルダ、スペースで撮影

カメラとマイクは HTTPS のページでのみ使えます。Chrome / Edge / Safari の最新版を想定しています。

## アプリとして使う（PWA）

- iPhone / iPad：Safari の共有メニュー →「ホーム画面に追加」
- Android / PC の Chrome・Edge：メニューの「インストール」（設定画面のボタンからも可）

インストール後は全画面で起動し、一度開いていれば電波のない場所でも起動できます。

### スマートフォンで使うとき

- LINE や Instagram などのアプリ内ブラウザではカメラを使えないことがあります。Safari か Chrome で開いてください
- iPhone でホーム画面のアプリからカメラが動かない場合は、Safari で開いてください（iOS 側の既知の不具合です）
- 画質は「自動」が初期設定で、重いプリセットでは解像度を自動で下げます
- 撮影後は「Share」→「画像を保存 / ビデオを保存」で写真アプリに入ります
- 横向きにすると、シャッターが右側に移るレイアウトになります

## 仕組み

1. **グラフ形式**：オペレーター（TOP / CHOP）・接続・パラメータ・エクスプレッションを持つネットワーク。.toe から読み出したものも、オリジナルのプリセットも同じ形式です
2. **エンジン**（`src/engine.js`）：TOP をシェーダーに対応させて毎フレーム評価します（Level / Luma Level / Composite / Matte / Lookup / Ramp / Blur / Displace / Feedback / Time Machine / Cache / Blob Track など約 60 種類）。CHOP（LFO・ノイズ・音声解析）とパラメータ式（`op('lfo1')['chan1']`、`absTime.seconds`、`sin()` など）も評価します
3. **FX ライブラリ**（`src/fx.js`）：GLSL TOP に相当する 70 種類あまりのシェーダー（フィルムの色と粒子、ハーフトーン、Kuwahara、オプティカルフロー、データモッシュ、万華鏡 など）
4. **プリセット**（`src/presets.js`）：上の部品をつないだ小さなネットワーク。1 プリセットが 1〜数行です
5. **.toe の読み込み**（`src/toe.js`）：TEA-ECB で包まれた zlib ストリームをブラウザ内で展開します。設定の「.toe を読み込む」から手元のファイルを実行できます

```js
// 例：動きだけが画を押し流すデータモッシュ
def('GLITCH', 'Datamosh', '…', g => {
  const c = g.cam, lo = g.top('res', [g.blur(c, 6)], { outputresolution: 'quarter' }, 'lo');
  const fl = g.blur(g.fx('flow', [lo, g.prev(lo)], { gain: 1.5 }), 4);          // 前フレームとの差からフロー
  g.fx('mosh', [g.fb('mosh1', c), fl, c], { carry: 2.2, refresh: .004 }, 'mosh1'); // フィードバックをフローで運ぶ
  g.out('mosh1');
});
```

### .toe から移植したシステム

次のプリセットは、.toe ファイルのネットワーク（オペレーターのつなぎ方とパラメータ値）をそのまま移したものです。カメラ入力向けに一部の値を調整し、主要な値は Adjust のスライダーに出しています。

| プリセット | 元のネットワーク |
|---|---|
| GLITCH / Thermal | Luma Level（反転）→ Feedback・Blur・Level のループを Over で重ねる → 5 色の Ramp を Lookup（RGBA 個別）→ Noise → Displace → Overlay |
| GLITCH / Pixelate | Edge → パレットの Pixelate（4×2）を、絵と Time Machine のマップの両方に使い、Noise を Threshold したマットで Matte 合成 |
| FILM / Film Look | Level → Threshold（ソフト）→ Blur → Screen → Bloom TOP → Noise TOP（粒子） |
| FILM / Expired Roll | 同じファイルの別出力：Threshold → 赤い Ramp を Lookup → Blur → Screen、Ramp の色かぶりを Screen、Level、粒子 |
| FILM / Tri-X Push | 同じファイルの別出力：ブルームした絵に元の絵を Add → 粒子 → Monochrome |

同じ .toe は、設定の「.toe を読み込む」からそのまま実行することもできます。

### SENSOR フォルダ

4 つの .toe のネットワークを並べて学び、その部品を組み替えた 20 種類です。

| もとの仕組み | 使っているプリセット |
|---|---|
| Blob Track TOP（2 番目の入力に遅らせた映像を入れ、動いた所を四角で囲む）と Cache TOP の遅延 | Tracker / Motion Boxes / Constellation / Auto Mosaic / Spotlight / Heat Seeker / CCTV / Red Alert / Ghost Diff |
| Luma Level → Feedback・Blur・Level のループ → 色キーの Ramp を Lookup | Ironbow / White Hot / Rainbow Heat / Arctic / Heat Trail / Scanner / Noise Portal |
| Noise を足した絵で Displace（縦に強く）し、Time Machine のマップにする | Drip / Time Drip / Tracker |
| Edge → Pixelate を Time Machine のマップに、Noise の Threshold を Matte に | Edge Memory / Block Delay / Noise Portal |
| Level → Threshold → Blur → Screen、黒から赤の Ramp を Lookup、Noise TOP の粒子 | White Hot / Red Alert / CCTV |

Blob Track は、低解像度のマスクを GPU で作って非同期に読み戻し、CPU で連結領域を四角にして ID を引き継ぎます（TouchDesigner は OpenCV を使います）。

## ビルド

```
node build.cjs
```

`src/` を 1 枚の `index.html` にまとめ、`manifest.webmanifest`・`sw.js`・`icons/` を書き出します（依存パッケージなし）。

## 旧版

.toe から作った 17 プリセットの版は [`classic/`](https://toruma00-debug.github.io/toe-effect-camera/classic/) に残しています。

## クレジット

- 旧版の TDwixtor プリセット: uisato 氏の「Realtime Audioreactive Time Remap」プロジェクトの設定値に基づいています
- .toe コンテナの形式は [WebToe の TOE-FORMAT.md](https://github.com/frank890417/WebToe/blob/main/docs/TOE-FORMAT.md) の記述を参照しました
- 書体 Jost（The Jost Project Authors）— SIL Open Font License 1.1（`assets/Jost-OFL.txt`）

TouchDesigner は Derivative Inc. の製品です。本ページは Derivative とは関係ありません。
