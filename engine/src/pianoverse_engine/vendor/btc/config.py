# run_config.yaml of jayg996/BTC-ISMIR19 (MIT, see LICENSE) as a dict, set up for the
# large vocabulary the way test.py does with --voca (large_voca=True, num_chords=170).
# Training/experiment/path sections dropped.

CONFIG = {
    'mp3': {
        'song_hz': 22050,
        'inst_len': 10.0,
        'skip_interval': 5.0,
    },
    'feature': {
        'n_bins': 144,
        'bins_per_octave': 24,
        'hop_length': 2048,
        'large_voca': True,
    },
    'model': {
        'feature_size': 144,
        'timestep': 108,
        'num_chords': 170,
        'input_dropout': 0.2,
        'layer_dropout': 0.2,
        'attention_dropout': 0.2,
        'relu_dropout': 0.2,
        'num_layers': 8,
        'num_heads': 4,
        'hidden_size': 128,
        'total_key_depth': 128,
        'total_value_depth': 128,
        'filter_size': 128,
        'loss': 'ce',
        'probs_out': False,
    },
}
