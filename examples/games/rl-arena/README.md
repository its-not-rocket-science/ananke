# RL Arena (Ananke + PPO)

5v5 sparse-reward reinforcement-learning arena scaffold.

## Included outputs

- `colab.ipynb`: Colab-ready training notebook
- `arena_env.py`: Gymnasium-compatible environment over Ananke bridge contract
- `train_ppo.py`: Stable-Baselines3 PPO training entrypoint
- `model/README.md`: where trained model artifacts are stored/downloaded

## Quickstart (local)

```bash
python -m venv .venv
source .venv/bin/activate
pip install stable-baselines3 gymnasium tensorboard numpy
python train_ppo.py --timesteps 200000
tensorboard --logdir runs
```

TensorBoard shows episodic reward and win-rate curves.
