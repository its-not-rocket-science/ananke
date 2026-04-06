# ML Researcher Path: Train an agent to win at combat

## Step 1 — Python bridge

```python
from arena_env import make_env
env = make_env(seed=7)
obs, info = env.reset()
print(obs.shape)
```

Expected output:

```txt
(128,)
```

## Step 2 — Gymnasium env

```python
import gymnasium as gym
env = gym.make('AnankeArena-v0')
obs, info = env.reset()
print(info['seed'])
```

Expected output:

```txt
7
```

## Step 3 — PPO training

```bash
python examples/games/rl-arena/train_ppo.py --timesteps 200000
```

Expected output:

```txt
eval/win_rate: 0.68
eval/episode_reward: 143.2
```
