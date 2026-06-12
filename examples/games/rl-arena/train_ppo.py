from __future__ import annotations

import argparse
from stable_baselines3 import PPO
from stable_baselines3.common.monitor import Monitor

from arena_env import RLArenaEnv


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--timesteps", type=int, default=100_000)
    parser.add_argument("--seed", type=int, default=1337)
    args = parser.parse_args()

    env = Monitor(RLArenaEnv(seed=args.seed))
    model = PPO("MlpPolicy", env, verbose=1, tensorboard_log="runs/ppo")
    model.learn(total_timesteps=args.timesteps)
    model.save("model/rl-arena-ppo")


if __name__ == "__main__":
    main()
