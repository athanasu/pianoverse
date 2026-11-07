# BTC (vendored)

Inference code for BTC, the Bi-directional Transformer for Chord recognition
(Park et al., ISMIR 2019), from https://github.com/jayg996/BTC-ISMIR19 at commit
`2682317be668032e6e4b269ded36adaa2ad57df0`. MIT License, see `LICENSE` (copied verbatim).

| File | Upstream source | Changes |
|---|---|---|
| `btc_model.py` | `btc_model.py` | Imports made package-relative; `HParams` import, `use_cuda` and the `__main__` demo removed; `BTC_model.forward(x, labels)` (prediction + training loss) replaced by an inference-only `forward(x)` returning per-frame logits. Module structure unchanged, so the upstream checkpoint loads strictly. |
| `transformer_modules.py` | `utils/transformer_modules.py` | `np.float` → `np.float64` (removed in numpy 1.24); `from __future__` lines and the training-only `loss` methods removed. |
| `config.py` | `run_config.yaml` | Model/feature/audio sections as a dict, with `large_voca=True` and `num_chords=170` as `test.py --voca` sets them; training/path sections dropped (no PyYAML needed). |
| `vocab.py` | `idx2voca_chord` in `utils/mir_eval_modules.py` | Unchanged. |

Feature extraction (`audio_file_to_features`) and windowed inference (`test.py`) are
reimplemented in `pianoverse_engine/chords_btc.py`. The weights
(`test/btc_model_large_voca.pt`) are not vendored: they are downloaded on first use and
checked by SHA-256.
