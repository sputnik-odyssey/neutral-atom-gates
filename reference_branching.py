"""Independent RK4 propagation of all 16 logical input operators (NumPy only)."""
import argparse
from math import pi
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('--steps', type=int, default=1000)
args = parser.parse_args()
d = 16
code = [0, 1, 4, 5]
epsilon, dephasing, blockade, decay, detuning = .07, .4, 3.7, .3, .11
fractions = [.25, .5, .25]
nr = [np.array([int(i // 4 == 2) for i in range(d)]),
      np.array([int(i % 4 == 2) for i in range(d)])]
rydberg_count = nr[0] + nr[1]
operators = np.zeros((16, d, d), dtype=complex)
for i in range(4):
    for j in range(4):
        operators[4*i+j, code[i], code[j]] = 1
dephase_rates = sum((n[:, None] - n[None, :])**2 for n in nr) * dephasing/(4*pi)
decay_rates = (rydberg_count[:, None] + rydberg_count[None, :]) * decay/(8*pi)
jumps = []
for atom in [0, 1]:
    source = np.array([8+s if atom == 0 else 4*s+2 for s in range(4)])
    for level, fraction in zip([0, 1, 3], fractions):
        target = np.array([4*level+s if atom == 0 else 4*s+level for s in range(4)])
        jumps.append((source, target, fraction * decay/(4*pi)))


def derivative(state, h):
    result = -1j*(h @ state - state @ h) - (dephase_rates + decay_rates)*state
    for source, target, rate in jumps:
        result[:, target[:, None], target[None, :]] += rate * state[:, source[:, None], source[None, :]]
    return result


for atom, duration in [(0, 1), (1, 2), (0, 1)]:
    h = np.diag(-detuning*rydberg_count.astype(complex))
    h[10, 10] += blockade
    for s in range(4):
        a, b = (4+s, 8+s) if atom == 0 else (4*s+1, 4*s+2)
        h[a, b] = h[b, a] = (1+epsilon)/2
    dt = pi/args.steps
    for _ in range(duration*args.steps):
        k1 = derivative(operators, h)
        k2 = derivative(operators+dt*k1/2, h)
        k3 = derivative(operators+dt*k2/2, h)
        k4 = derivative(operators+dt*k3, h)
        operators += dt*(k1+2*k2+2*k3+k4)/6

z = np.array([(-1 if i//4 == 1 else 1)*(-1 if i%4 == 1 else 1) for i in range(d)])
operators *= z[:, None]*z[None, :]
rho = operators.sum(axis=0)/4
average = sum(operators[5*i] for i in range(4))/4
target = np.zeros(d); target[code] = np.array([1, 1, 1, -1])/2
signs = [1, 1, 1, -1]
process = sum(signs[i]*signs[j]*operators[4*i+j, code[i], code[j]].real for i in range(4) for j in range(4))/16
survival = average[code, code].real.sum()
outside = [i for i in range(d) if i//4 == 3 or i%4 == 3]
print({'average_fidelity': float((survival+4*process)/5),
       'test_fidelity': float((target @ rho @ target).real),
       'process_fidelity': float(process), 'leakage': float(1-survival),
       'other_state_leakage': float(average[outside, outside].real.sum()),
       'trace': float(np.trace(rho).real), 'minimum_eigenvalue': float(np.linalg.eigvalsh(rho).min())})
