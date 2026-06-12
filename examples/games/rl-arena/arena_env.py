"""RL Arena env: 5v5 sparse reward bridge stub for Ananke integration."""
from __future__ import annotations

import numpy as np
import gymnasium as gym
from gymnasium import spaces


class RLArenaEnv(gym.Env):
    metadata = {"render_modes": ["human"]}

    def __init__(self, seed: int = 1337):
        super().__init__()
        self.seed_value = seed
        self.rng = np.random.default_rng(seed)
        self.observation_space = spaces.Box(low=-1.0, high=1.0, shape=(64,), dtype=np.float32)
        self.action_space = spaces.Discrete(8)
        self.max_steps = 256
        self.step_count = 0

    def _obs(self) -> np.ndarray:
        return self.rng.uniform(-1.0, 1.0, size=(64,)).astype(np.float32)

    def reset(self, *, seed: int | None = None, options=None):
        if seed is not None:
            self.rng = np.random.default_rng(seed)
        self.step_count = 0
        return self._obs(), {}

    def step(self, action: int):
        del action
        self.step_count += 1
        reward = 0.0
        terminated = False
        if self.rng.random() < 0.02:
            reward = 1.0
            terminated = True
        elif self.rng.random() < 0.02:
            reward = -1.0
            terminated = True
        truncated = self.step_count >= self.max_steps
        info = {"win_rate_proxy": float(reward > 0)}
        return self._obs(), reward, terminated, truncated, info
