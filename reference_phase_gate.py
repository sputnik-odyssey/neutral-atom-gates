"""Recalibrate the Evered sinusoidal ansatz in the ideal infinite-blockade model.
Uses NumPy only. Independent RK4 evolution of single and bright two-level blocks.
The calibrated parameters are numerical model values, not experimental fits.
Run: python3 reference_phase_gate.py
"""
import numpy as np,json

def evolve(p,steps=2048):
 A,w,T=p; phi0=(w*T-3*np.pi)/2
 y=np.array([[1,0],[1,0]],dtype=complex);g=np.array([.5,2**-.5]);dt=T/steps
 def deriv(y,t):
  e=np.exp(1j*A*np.cos(w*t-phi0))
  return -1j*g[:,None]*np.stack([e.conjugate()*y[:,1],e*y[:,0]],axis=1)
 for k in range(steps):
  t=k*dt;a=deriv(y,t);b=deriv(y+dt*a/2,t+dt/2);c=deriv(y+dt*b/2,t+dt/2);d=deriv(y+dt*c,t+dt)
  y+=dt*(a+2*b+2*c+d)/6
 return y

def residual(p):
 y=evolve(p);phase=np.angle(-y[1,0]*y[0,0].conjugate()**2)
 return np.r_[y[:,1].real,y[:,1].imag,phase]
p=np.array([2*np.pi*.1122,1.0431,2*np.pi*1.215])
print('seed',p,residual(p))
for k in range(8):
 r=residual(p);h=1e-5;j=np.stack([(residual(p+np.eye(3)[i]*h)-residual(p-np.eye(3)[i]*h))/(2*h) for i in range(3)],axis=1)
 p+=np.linalg.lstsq(j,-r,rcond=None)[0]
 print(k,p,np.linalg.norm(residual(p)))
y=evolve(p,4096)
print(json.dumps({'A':p[0],'omegaOverOmega':p[1],'durationU':p[2],'phi0':(p[1]*p[2]-3*np.pi)/2,'phaseSingle':float(np.angle(y[0,0])),'maxLeakage':float(np.max(abs(y[:,1])**2))},indent=2))
