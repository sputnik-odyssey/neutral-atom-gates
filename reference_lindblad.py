"""Independent check of noise.mjs using direct matrix RK4 (requires NumPy).

Run: python3 reference_lindblad.py
This program does not use analytic pulse propagators or the splitting method.
"""
import numpy as np
from math import pi

epsilon, dephasing, blockade = .07, .4, 3.7
computational = [0, 1, 3, 4]
projectors = [np.diag([int(i // 3 == 2) for i in range(9)]),
              np.diag([int(i % 3 == 2) for i in range(9)])]
psi = np.zeros(9, dtype=complex)
psi[computational] = .5
rho = np.outer(psi, psi.conj())
gamma = dephasing / (4 * pi)


def derivative(state, hamiltonian):
    result = -1j * (hamiltonian @ state - state @ hamiltonian)
    for nr in projectors:
        result += 2 * gamma * (nr @ state @ nr - (nr @ state + state @ nr) / 2)
    return result


for atom, duration in [(0, 1), (1, 2), (0, 1)]:
    h = np.zeros((9, 9), dtype=complex)
    h[8, 8] = blockade
    for a in range(9):
        control, target = divmod(a, 3)
        if (control if atom == 0 else target) == 1:
            other = 6 + target if atom == 0 else 3 * control + 2
            h[a, other] = h[other, a] = (1 + epsilon) / 2
    steps = duration * 2000
    dt = duration * pi / steps
    for _ in range(steps):
        k1 = derivative(rho, h)
        k2 = derivative(rho + dt * k1 / 2, h)
        k3 = derivative(rho + dt * k2 / 2, h)
        k4 = derivative(rho + dt * k3, h)
        rho += dt * (k1 + 2 * k2 + 2 * k3 + k4) / 6

correction = np.diag([1, -1, 1, -1, 1, -1, 1, -1, 1])
rho = correction @ rho @ correction
target = np.zeros(9)
target[computational] = np.array([1, 1, 1, -1]) / 2
state_fidelity = float((target @ rho @ target).real)
survival = float(rho[computational, computational].real.sum())
print({"average_fidelity": (survival + 4 * state_fidelity) / 5,
       "state_fidelity": state_fidelity, "leakage": 1 - survival,
       "trace": float(np.trace(rho).real),
       "minimum_eigenvalue": float(np.linalg.eigvalsh(rho).min())})
