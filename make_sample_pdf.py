#!/usr/bin/env python3
"""Generate a 32-page open turbulence review with a Computer Modern / LaTeX look.
Body text uses cmr10 (selectable); display equations + Greek/operator glyphs are
rendered with Computer Modern mathtext as crisp images. Mirrors the product mockups
(2.3 Energy Cascade ~p7, Figure 3 ~p9, Dissipation ~p11, Spectral Characteristics ~p12)."""
import os, hashlib, matplotlib
matplotlib.use("Agg")
matplotlib.rcParams["mathtext.fontset"] = "cm"
matplotlib.rcParams["mathtext.rm"] = "serif"
import matplotlib.pyplot as plt
import numpy as np
from matplotlib import font_manager as fm

WS = "/agent/workspace"
IMG = os.path.join(WS, "eqimg"); os.makedirs(IMG, exist_ok=True)
FIG = os.path.join(WS, "fig3_spectrum.png")
FIG2 = os.path.join(WS, "fig_dns.png")

# ---------- Figure 3: energy spectrum (matches mockups) ----------
def make_fig3():
    k = np.logspace(0, 4, 500)
    Ek = (1.0/(1.0+(k/8.0)**2)**(5.0/6.0))*np.exp(-(k/3000.0)**(4.0/3.0))
    ref = 3.0*k**(-5.0/3.0)
    fig, ax = plt.subplots(figsize=(6.2, 4.0), dpi=150)
    ax.loglog(k, Ek, color="#2563EB", lw=2.0, label=r"$E(k)$")
    ax.loglog(k[(k>15)&(k<1200)], ref[(k>15)&(k<1200)], "--", color="#111827", lw=1.4, label=r"$\propto k^{-5/3}$")
    ax.set_xlim(1,1e4); ax.set_ylim(1e-8,2)
    ax.set_xlabel(r"$k$", fontsize=13); ax.set_ylabel(r"$E(k)$", fontsize=13)
    for xb in (8,300): ax.axvline(xb, color="#9CA3AF", lw=0.8, ls=(0,(4,3)))
    ax.text(2.6,3e-5,"Energy\ncontaining\nrange",ha="center",fontsize=10)
    ax.text(50,3e-5,"Inertial\nsubrange",ha="center",fontsize=10)
    ax.text(1600,3e-5,"Dissipation\nrange",ha="center",fontsize=10)
    ax.legend(loc="upper right",frameon=False,fontsize=11); ax.tick_params(labelsize=10)
    fig.tight_layout(); fig.savefig(FIG,bbox_inches="tight",facecolor="white"); plt.close(fig)

def make_fig_dns():
    fig, ax = plt.subplots(figsize=(6.0,3.4), dpi=150)
    x=np.linspace(0,10,400)
    for lab,ph,col in [("DNS",0,"#2563EB"),("LES",0.4,"#059669"),("RANS",0.9,"#B45309")]:
        ax.plot(x, np.sin(x+ph)*np.exp(-0.05*x)+ (0.0 if lab=="DNS" else 0.0), color=col, lw=1.8, label=lab)
    ax.set_xlabel(r"$t\,U/L$",fontsize=12); ax.set_ylabel(r"resolved $u'/u_{rms}$",fontsize=12)
    ax.legend(frameon=False,fontsize=10); ax.tick_params(labelsize=9); ax.grid(alpha=.15)
    fig.tight_layout(); fig.savefig(FIG2,bbox_inches="tight",facecolor="white"); plt.close(fig)

make_fig3(); make_fig_dns()

# ---------- Computer Modern mathtext -> image ----------
_cache = {}
def math_img(expr, fs=10.5, dpi=340):
    key = hashlib.md5((expr+str(fs)).encode()).hexdigest()[:12]
    if key in _cache: return _cache[key]
    path = os.path.join(IMG, key+".png")
    fig = plt.figure(figsize=(0.01,0.01)); fig.patch.set_alpha(0)
    fig.text(0,0, f"${expr}$", fontsize=fs)
    fig.savefig(path, dpi=dpi, transparent=True, bbox_inches="tight", pad_inches=0.02)
    plt.close(fig)
    import struct
    with open(path,"rb") as fp:  # true pixel size from PNG IHDR header
        fp.read(16); pw,ph = struct.unpack(">II", fp.read(8))
    w_pt = pw/dpi*72.0; h_pt = ph/dpi*72.0
    _cache[key] = (path, w_pt, h_pt); return _cache[key]

# reportlab
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak, Table, TableStyle)
from reportlab.lib import colors

CM = fm.findfont(fm.FontProperties(family="cmr10"))
CMB = fm.findfont(fm.FontProperties(family="cmb10"))
pdfmetrics.registerFont(TTFont("CMR", CM))
pdfmetrics.registerFont(TTFont("CMB", CMB))
pdfmetrics.registerFontFamily("CMR", normal="CMR", bold="CMB", italic="CMR", boldItalic="CMB")
# Serif math font with full Greek / superscript / operator coverage — renders math as REAL,
# selectable text (so highlighting a line that contains math actually captures the math).
MATHF = fm.findfont(fm.FontProperties(family="DejaVu Serif"))
pdfmetrics.registerFont(TTFont("MATH", MATHF))

body = ParagraphStyle("body", fontName="CMR", fontSize=10.5, leading=15.2, alignment=TA_JUSTIFY, spaceAfter=7)
h1 = ParagraphStyle("h1", fontName="CMB", fontSize=14, leading=18, spaceBefore=13, spaceAfter=6)
h2 = ParagraphStyle("h2", fontName="CMB", fontSize=11.7, leading=15.5, spaceBefore=10, spaceAfter=4)
title = ParagraphStyle("title", fontName="CMB", fontSize=19, leading=24, alignment=TA_CENTER, spaceAfter=8)
sub = ParagraphStyle("sub", fontName="CMR", fontSize=11, leading=15, alignment=TA_CENTER, textColor=colors.HexColor("#333333"), spaceAfter=3)
cap = ParagraphStyle("cap", fontName="CMR", fontSize=9.4, leading=12.6, alignment=TA_JUSTIFY, spaceBefore=4, spaceAfter=10)
refst = ParagraphStyle("ref", parent=body, fontSize=9.4, leading=12.6, spaceAfter=4)

# unicode -> ascii for cmr10-safe plain text
_MAP = {"–":"-","—":"--","’":"'","‘":"'","“":'"',"”":'"',"…":"..."," ":" ","·":"-"}
def cm_safe(s):
    for a,b in _MAP.items(): s=s.replace(a,b)
    return s
def esc(s): return cm_safe(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
def escx(s): return s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")   # keep unicode (for math)

# ---- LaTeX -> Unicode (selectable math) ----
import re as _re
_SUP={'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','(':'⁽',')':'⁾','n':'ⁿ','i':'ⁱ','=':'⁼'}
_SUB={'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋','(':'₍',')':'₎'}
_GREEK={r'\varepsilon':'ε',r'\epsilon':'ε',r'\alpha':'α',r'\beta':'β',r'\gamma':'γ',r'\delta':'δ',r'\eta':'η',r'\zeta':'ζ',r'\nu':'ν',r'\mu':'μ',r'\rho':'ρ',r'\sigma':'σ',r'\tau':'τ',r'\phi':'φ',r'\kappa':'κ',r'\lambda':'λ',r'\pi':'π',r'\theta':'θ'}
_OPS={r'\longrightarrow':' ⟶ ',r'\rightarrow':' → ',r'\leftarrow':' ← ',r'\leftrightarrow':' ↔ ',r'\Rightarrow':' ⇒ ',r'\propto':' ∝ ',r'\approx':' ≈ ',r'\sim':' ∼ ',r'\times':'×',r'\cdot':'·',r'\pm':'±',r'\leq':'≤',r'\geq':'≥',r'\to':' → ',r'\infty':'∞',r'\exp':'exp',r'\ll':'≪',r'\gg':'≫',r'\langle':'⟨',r'\rangle':'⟩',r'\left':'',r'\right':'',r'\quad':'  ',r'\,':' ',r'\;':' ',r'\ ':' ',r'\!':''}
def _grp(s, table): return ''.join(table[c] for c in s) if all(c in table for c in s) else None
def tex2uni(e):
    e=_re.sub(r'\\(?:mathrm|mathit|mathbf|mathsf|mathcal|text|operatorname)\s*\{([^}]*)\}', r'\1', e)  # text macros -> content
    for k,v in _GREEK.items(): e=e.replace(k,v)
    for k,v in _OPS.items(): e=e.replace(k,v)
    e=_re.sub(r'\^\{([^}]*)\}', lambda m:(_grp(m.group(1),_SUP) or ('^('+m.group(1)+')')), e)
    e=_re.sub(r'_\{([^}]*)\}',  lambda m:(_grp(m.group(1),_SUB) or ('_'+m.group(1))), e)
    e=_re.sub(r'\^(\w)', lambda m:_SUP.get(m.group(1),'^'+m.group(1)), e)
    e=_re.sub(r'_(\w)',  lambda m:_SUB.get(m.group(1),'_'+m.group(1)), e)
    e=e.replace('{','').replace('}','').replace('\\','')
    e=e.replace('-','−')
    return e

def RT(s):
    """Turn a string with $...$ math into reportlab markup: math -> selectable MATH-font text."""
    out=[]; i=0
    while i < len(s):
        if s[i]=="$":
            j=s.index("$", i+1); expr=s[i+1:j]
            out.append(f'<font name="MATH" size="10">{escx(tex2uni(expr))}</font>')
            i=j+1
        else:
            j=s.find("$", i); j = len(s) if j<0 else j
            out.append(esc(s[i:j])); i=j
    return "".join(out)
def P(s, style=body): return Paragraph(RT(s), style)

def eq(expr, num, fs=13):
    # Display equation as centered, SELECTABLE Unicode text (not an image) so it can be captured.
    eqp = Paragraph(f'<font name="MATH" size="12.5">{escx(tex2uni(expr))}</font>',
                    ParagraphStyle("eqm", parent=body, alignment=TA_CENTER, spaceBefore=0, spaceAfter=0))
    t=Table([[eqp, Paragraph(num, ParagraphStyle("n",parent=body,alignment=2))]],
            colWidths=[5.5*inch,0.7*inch])
    t.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"MIDDLE"),("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),6)]))
    return t

S=[]
def H1(n,t): S.append(P(f"{n}   {t}", h1))
def H2(n,t): S.append(P(f"{n}  {t}", h2))
def par(t): S.append(P(t))

# ------- Title page -------
S += [Spacer(1,0.9*inch)]
S += [P("Energy Transfer and Spectral Structure in Turbulent Flows: A Review", title)]
S += [Spacer(1,0.1*inch)]
S += [P("An Open Review Prepared for Reading-Workspace Demonstration", sub)]
S += [P("L. Kolmogorov-Reader, R. Richardson, and the Open Turbulence Collective", sub)]
S += [Spacer(1,0.3*inch)]
S += [P("Abstract", ParagraphStyle("abh",parent=h2,alignment=TA_CENTER))]
S += [P("Turbulence is characterized by the transfer of kinetic energy across a wide range of interacting "
   "scales. This review summarizes the statistical description of homogeneous, isotropic turbulence, the "
   "Richardson-Kolmogorov energy cascade, the $-5/3$ inertial-subrange spectrum, the dissipation range, and "
   "the role of intermittency. We connect the spectral picture to engineering practice and to the three main "
   "families of numerical methods. The document is released under CC BY 4.0 and is intended as an openly "
   "redistributable sample for demonstrating a source-linked reading workspace.", ParagraphStyle("ab",parent=body,leftIndent=40,rightIndent=40))]
S += [PageBreak()]

# sentence pool for realistic padding
POOL = [
 "The nonlinear advective term couples Fourier modes across a broad band of wavenumbers, which is the origin of the cascade.",
 "Energy injected at the largest scales is transferred, on average, toward smaller scales at a rate set by the large-eddy turnover time.",
 "In statistically stationary turbulence the mean dissipation rate equals the mean energy input rate.",
 "Local isotropy is expected to hold at scales much smaller than the integral scale and much larger than the Kolmogorov scale.",
 "Experimental measurements in grid turbulence and atmospheric surface layers broadly confirm the classical scaling.",
 "High-resolution direct numerical simulation has become an indispensable tool for probing small-scale statistics.",
 "The separation of scales widens with Reynolds number, extending the inertial subrange over more decades.",
 "Deviations from self-similarity, known as intermittency, become more pronounced for high-order statistics.",
 "The spectral flux is approximately constant across the inertial range, a hallmark of the cascade picture.",
 "Boundary conditions and anisotropy at the largest scales leave their imprint on the energy-containing range.",
 "Closure models attempt to represent the unresolved scales in terms of resolved-scale quantities.",
 "The Kolmogorov constant has been estimated to lie near 1.5 across a range of flows.",
 "Two-point correlations and structure functions provide complementary views of the same statistics.",
 "The dissipation range is governed by viscosity and falls off faster than any power law.",
]
def filler(nsub, start_idx=0):
    """Emit nsub short subsections of topical prose to pad page count."""
    titles=["Further Remarks","Scaling Considerations","Statistical Estimators","Modeling Implications",
            "Numerical Resolution","Spectral Diagnostics","Comparisons with Experiment","Practical Notes",
            "Dimensional Analysis","Anisotropy Effects","Forcing and Injection","Small-Scale Universality"]
    for s in range(nsub):
        S.append(P(titles[(start_idx+s)%len(titles)], h2))
        for _ in range(3):
            par(" ".join(np.random.choice(POOL, size=4, replace=False)))

np.random.seed(7)

# ------- 1 Introduction (padded so 2.3 lands ~p7) -------
H1("1","Introduction")
par("Turbulent motion appears throughout nature and engineering, from planetary boundary layers to the flow "
    "around aircraft and through turbomachinery. Despite its ubiquity, turbulence remains one of the outstanding "
    "problems of classical physics because it couples an enormous range of length and time scales in a strongly "
    "nonlinear manner. The Navier-Stokes equations govern the dynamics, yet direct solution across all scales is "
    "computationally prohibitive at the Reynolds numbers of practical interest.")
par("A productive route is the statistical description, in which one studies averaged quantities, correlation "
    "functions, and spectra rather than individual flow realizations. This review develops that description and "
    "connects it to the physical picture of an energy cascade from large to small scales.")
H2("1.1","Historical Background")
par("Richardson's poetic image of whorls giving rise to smaller whorls anticipated the modern cascade picture. "
    "Kolmogorov placed the idea on a quantitative footing in 1941 by postulating local isotropy and a constant "
    "energy flux through the inertial subrange, from which the celebrated $-5/3$ spectrum follows on dimensional grounds.")
par("Subsequent work refined the theory to account for intermittency, introduced multifractal descriptions, and "
    "extended the analysis to passive scalars, magnetohydrodynamics, and compressible flows. The essential scaling, "
    "however, has proven remarkably robust and continues to anchor both experiment and simulation.")
H2("1.2","Scope and Notation")
par("We denote the velocity field by u, its mean by U, and the fluctuation by u'. The wavenumber is k, the "
    "kinematic viscosity is $\\nu$, and the mean dissipation rate per unit mass is $\\varepsilon$. Angle brackets "
    "denote ensemble averages. Throughout, we assume incompressible flow unless stated otherwise.")
par("The remainder of the paper is organized as follows. Section 2 develops the statistical description and the "
    "energy cascade. Section 3 analyzes the energy spectrum. Section 4 treats scaling laws and the dissipation "
    "range. Sections 5 and 6 discuss engineering applications and numerical methods, and later sections survey "
    "wall-bounded flows, scalar transport, and open problems.")
filler(6, 0)

# ------- 2 Statistical Description -------
H1("2","Statistical Description of Turbulence")
H2("2.1","Reynolds Decomposition")
par("The velocity field is decomposed into a mean and a fluctuating part, u = U + u'. Substituting this "
    "decomposition into the Navier-Stokes equations and averaging yields the Reynolds-averaged equations, in "
    "which the Reynolds stresses encode the effect of the fluctuations on the mean flow. Closing these equations "
    "requires modeling assumptions that remain an active area of research.")
par("The turbulent kinetic energy is one half the trace of the Reynolds-stress tensor. Its budget contains "
    "production, transport, and dissipation terms whose balance characterizes the state of the flow.")
H2("2.2","Correlation Functions")
par("The two-point velocity correlation function R(r) measures the statistical similarity of velocity fluctuations "
    "separated by a distance r. For homogeneous, isotropic turbulence R(r) depends only on the separation magnitude "
    "and provides a natural definition of the integral length scale discussed in Section 4.3. Its Fourier transform "
    "is the energy spectrum, the central object of the spectral analysis below.")
par("Structure functions, defined from velocity increments, offer a complementary real-space characterization and "
    "are particularly convenient for quantifying intermittency.")
filler(4, 2)

H2("2.3","Energy Cascade")
par("A defining feature of turbulence is the transfer of kinetic energy across a wide range of scales. In the "
    "inertial subrange, energy is transferred from larger eddies to progressively smaller eddies without significant "
    "loss until it reaches the dissipation scale, where viscous effects dominate.")
par("According to Kolmogorov's 1941 theory, the energy spectrum E(k) in the inertial range follows the $-5/3$ power law:")
S.append(eq(r"E(k) = C_K\,\varepsilon^{2/3}\,k^{-5/3}.", "(1)"))
par("where k is the wavenumber, $\\varepsilon$ is the mean rate of energy dissipation per unit mass, and "
    "$C_K \\approx 1.5$ is the Kolmogorov constant. This scaling has been widely observed in experiments and "
    "high-resolution simulations, though deviations occur near the energy-containing and dissipation ranges. The "
    "energy cascade can be summarized as:")
S.append(eq(r"\mathrm{large\ scales}\ \rightarrow\ \mathrm{inertial\ subrange}\ \rightarrow\ \mathrm{small\ scales}\ \rightarrow\ \mathrm{dissipation}.", ""))

H2("2.4","Intermittency")
par("Turbulent flows are intermittent in space and time, characterized by intense, irregular fluctuations. "
    "Intermittency leads to departures from self-similarity and affects the statistics of velocity increments. "
    "Structure functions are often used to quantify intermittency:")
S.append(eq(r"S_p(r) = \langle\,|\delta u(r)|^{p}\,\rangle \sim r^{\zeta_p}", "(2)"))
par("where $\\zeta_p$ are the scaling exponents. Deviation of $\\zeta_p$ from the self-similar prediction p/3 is a "
    "hallmark of intermittency corrections to the 1941 theory.")
filler(3, 3)

# ------- 3 Spectral Analysis (Fig 3 ~ p9) -------
H1("3","Spectral Analysis")
H2("3.1","The Energy Spectrum")
par("The energy spectrum E(k) describes how turbulent kinetic energy is distributed across wavenumbers. "
    "Integrating E(k) over all k recovers the total turbulent kinetic energy per unit mass. The spectrum exhibits "
    "three characteristic regions: an energy-containing range at low wavenumbers, an inertial subrange at "
    "intermediate wavenumbers, and a dissipation range at high wavenumbers.")
par("The shape of the spectrum near the injection scale reflects the forcing and geometry, whereas the inertial "
    "subrange is believed to be approximately universal.")
H2("3.2","Energy Spectra in the Inertial Subrange")
par("In homogeneous, isotropic turbulence, the energy spectrum E(k) exhibits a characteristic $-5/3$ power-law "
    "behavior in the inertial subrange,")
S.append(eq(r"E(k) = C_K\,\varepsilon^{2/3}\,k^{-5/3},", "(3)"))
par("where $\\varepsilon$ is the mean energy dissipation rate per unit mass.")
S.append(Image(FIG, width=4.25*inch, height=2.74*inch))
S.append(P("<b>Figure 3:</b> Schematic of the turbulence kinetic energy spectrum. The spectrum shows three distinct "
    "regions: the energy-containing range at low wavenumbers, the inertial subrange where $E(k)\\propto k^{-5/3}$, "
    "and the dissipation range at high wavenumbers.", cap))
par("The inertial subrange spans wavenumbers for which energy is transferred conservatively from large to small "
    "scales without loss. Deviations from $-5/3$ scaling occur near the boundaries of this range.")

H2("3.3","Spectral Transfer and Flux")
par("The spectral energy transfer function T(k) describes the net rate at which energy is delivered to wavenumber "
    "k by nonlinear interactions. Integrating T(k) yields the spectral flux, which is approximately constant and "
    "positive across the inertial subrange, expressing the forward cascade of energy toward small scales.")
par("The constancy of the flux is the spectral counterpart of the constant-dissipation assumption and provides one "
    "of the cleanest diagnostics for identifying an inertial range in simulation and experiment.")
filler(4, 50)

# ------- 4 Scaling and Dissipation (4.1 ~ p12) -------
H1("4","Scaling Laws and Dissipation")
H2("4.1","Spectral Characteristics")
par("Turbulence exhibits a characteristic distribution of kinetic energy across scales, commonly described by the "
    "energy spectrum E(k), where k is the wavenumber. In the inertial subrange, Kolmogorov's 1941 theory predicts "
    "a universal $-5/3$ power law:")
S.append(eq(r"E(k) = C_K\,\varepsilon^{2/3}\,k^{-5/3}.", "(4.1)"))
par("This scaling arises from the assumption of local isotropy and a constant flux of energy across scales in the "
    "inertial subrange.")
H2("4.2","Dissipation Range")
par("At sufficiently high wavenumbers, viscous effects dominate and the energy spectrum falls off more steeply than "
    "any power law. A common empirical model for the dissipation range is the exponential form:")
S.append(eq(r"E(k) = A\,k^{-n}\,\exp\left(-\beta\,(k/k_\eta)^{4/3}\right),", "(4.2)"))
par("where $k_\\eta = (\\varepsilon/\\nu^3)^{1/4}$ is the Kolmogorov wavenumber and $\\nu$ is the kinematic "
    "viscosity. Below the Kolmogorov scale, essentially no turbulent kinetic energy remains.")
H2("4.3","Integral Quantities")
par("The turbulence intensity, length scales, and Reynolds number provide macroscopic measures that link the "
    "spectral description to engineering applications. The integral length scale is defined as:")
S.append(eq(r"L = \int_0^{\infty} \frac{R(r)}{R(0)}\,dr,", "(4.3)"))
par("where R(r) is the two-point velocity correlation function. The ratio of the integral scale to the Kolmogorov "
    "scale grows with Reynolds number, which is precisely why high-Reynolds-number turbulence is so difficult to "
    "resolve numerically.")
H2("4.4","Reynolds Number and Scale Separation")
par("The Reynolds number Re = UL/$\\nu$ quantifies the ratio of inertial to viscous forces. As Re increases, the "
    "separation between the integral scale and the Kolmogorov scale widens, extending the inertial subrange. The "
    "number of degrees of freedom required to represent the flow scales approximately as Re raised to the 9/4 power, "
    "which explains the steep cost of resolving all scales at high Reynolds number.")
filler(3, 4)

# ------- 5 Applications -------
H1("5","Applications in Engineering")
par("The spectral description of turbulence underpins the predictive tools used across aerospace, mechanical, civil, "
    "and chemical engineering. In external aerodynamics, accurate representation of the energy-containing eddies "
    "governs predictions of drag, lift, and boundary-layer separation. In turbomachinery and combustion, the cascade "
    "of energy to small scales controls mixing rates and the efficiency of chemical reactions.")
par("Because the inertial subrange is approximately universal, engineers can calibrate subgrid-scale models against "
    "the $-5/3$ spectrum and expect them to generalize across geometries. Wind engineering, pollutant dispersion, and "
    "heat-exchanger design all rely on the same statistical picture.")
H2("5.1","Length and Time Scales in Practice")
par("Practical estimates of the Kolmogorov length $\\eta = (\\nu^3/\\varepsilon)^{1/4}$ and time scale "
    "$\\tau = (\\nu/\\varepsilon)^{1/2}$ allow engineers to size grids and time steps before committing to an "
    "expensive simulation. When the required spacing approaches $\\eta$ everywhere, direct simulation becomes "
    "feasible only for modest Reynolds numbers.")
filler(3, 6)

# ------- 6 Numerical methods (with 2nd figure) -------
H1("6","Numerical Approaches: DNS, LES, and RANS")
par("Three broad families of numerical methods are used to compute turbulent flows. Direct numerical simulation "
    "(DNS) resolves all scales down to the Kolmogorov scale and requires no turbulence model, but its cost restricts "
    "it to low and moderate Reynolds numbers. Large-eddy simulation (LES) resolves the energy-containing and inertial "
    "scales while modeling the subgrid scales, exploiting the approximate universality of the small scales.")
par("Reynolds-averaged Navier-Stokes (RANS) methods model the entire spectrum of fluctuations through the Reynolds "
    "stresses and remain the workhorse of industrial computational fluid dynamics. Hybrid approaches blend LES in "
    "separated regions with RANS near walls.")
S.append(Image(FIG2, width=4.5*inch, height=2.55*inch))
S.append(P("<b>Figure 6:</b> Illustrative resolved fluctuating velocity for DNS, LES, and RANS treatments of the "
    "same flow; higher-fidelity methods resolve more of the spectrum.", cap))
H2("6.1","Validation Against the Spectrum")
par("A standard validation exercise is to compute the energy spectrum from a simulation and compare its slope over "
    "the inertial subrange against the $-5/3$ reference. Departures indicate insufficient resolution, excessive "
    "numerical dissipation, or deficiencies in the subgrid model.")
filler(4, 8)

# ------- 7-10 extra sections to reach ~32 pages -------
for sec,(title_,paras) in enumerate([
   ("Wall-Bounded Turbulence",
     ["Near a solid wall, turbulence is strongly anisotropic and the classical isotropic scaling must be modified. "
      "The logarithmic law of the wall describes the mean velocity profile in the overlap region.",
      "The production of turbulent kinetic energy peaks in the buffer layer, where coherent streaks and quasi-"
      "streamwise vortices dominate the dynamics."]),
   ("Passive Scalar Transport",
     ["A passive scalar advected by turbulence develops its own cascade, with a spectrum that depends on the Schmidt "
      "or Prandtl number. In the inertial-convective range the scalar spectrum also follows a $-5/3$ law.",
      "At scales below the Kolmogorov scale but above the diffusive scale, the Batchelor regime predicts a "
      "$k^{-1}$ scalar spectrum for high Schmidt number."]),
   ("Compressible and Reacting Flows",
     ["Compressibility introduces dilatational motions and couples the velocity field to thermodynamic fluctuations. "
      "At modest turbulent Mach number the solenoidal cascade remains close to the incompressible picture.",
      "In reacting flows, heat release modifies the local density and can either enhance or suppress turbulence "
      "depending on the regime."]),
   ("Data-Driven Closures",
     ["Machine-learning methods have been applied to infer subgrid stresses and to accelerate closure modeling. "
      "Physical constraints such as Galilean invariance and realizability improve generalization.",
      "A recurring theme is to constrain learned models to respect the known inertial-range scaling, using the "
      "$-5/3$ spectrum as an inductive bias."]),
   ("Open Problems",
     ["The precise values of the intermittency exponents, the universality of the Kolmogorov constant, and the "
      "behavior of the dissipation-range spectrum remain topics of active research.",
      "Bridging the gap between canonical homogeneous turbulence and complex engineering flows continues to "
      "motivate both theory and computation."]),
]):
    H1(str(7+sec), title_)
    for p in paras: par(p)
    filler(6, 10+sec*2)

# ------- References + appendix -------
H1("12","Conclusion")
par("The statistical and spectral description of turbulence provides a coherent picture of energy transfer from "
    "large, energy-containing eddies through an inertial subrange governed by the $-5/3$ law to a dissipation range "
    "where viscosity converts kinetic energy into heat. Intermittency introduces measurable corrections to the "
    "classical scaling exponents. Together these ideas underpin modern turbulence modeling and simulation.")
H2("","References")
REFS=[
 "A. N. Kolmogorov. The local structure of turbulence in incompressible viscous fluid for very large Reynolds numbers. Dokl. Akad. Nauk SSSR, 30:301-305, 1941.",
 "L. F. Richardson. Weather Prediction by Numerical Process. Cambridge University Press, 1922.",
 "G. K. Batchelor. The Theory of Homogeneous Turbulence. Cambridge University Press, 1953.",
 "U. Frisch. Turbulence: The Legacy of A. N. Kolmogorov. Cambridge University Press, 1995.",
 "S. B. Pope. Turbulent Flows. Cambridge University Press, 2000.",
 "H. Tennekes and J. L. Lumley. A First Course in Turbulence. MIT Press, 1972.",
 "A. S. Monin and A. M. Yaglom. Statistical Fluid Mechanics, Vols. 1-2. MIT Press, 1971-1975.",
 "P. A. Davidson. Turbulence: An Introduction for Scientists and Engineers. Oxford University Press, 2004.",
 "K. R. Sreenivasan. On the universality of the Kolmogorov constant. Phys. Fluids, 7:2778-2784, 1995.",
 "P. Sagaut. Large Eddy Simulation for Incompressible Flows. Springer, 2006.",
 "J. Smagorinsky. General circulation experiments with the primitive equations. Mon. Weather Rev., 91:99-164, 1963.",
 "R. H. Kraichnan. Inertial ranges in two-dimensional turbulence. Phys. Fluids, 10:1417-1423, 1967.",
]
for r in REFS: S.append(P("- "+r, refst))
H1("A","Appendix: The Four-Fifths Law")
par("Kolmogorov's four-fifths law is one of the few exact results in turbulence theory. For homogeneous, isotropic "
    "turbulence at high Reynolds number, the third-order longitudinal structure function satisfies")
S.append(eq(r"\langle (\delta u_\parallel(r))^3 \rangle = -\frac{4}{5}\,\varepsilon\,r,", "(A.1)"))
par("valid in the inertial range. This exact relation provides a stringent test for experiments and simulations and "
    "anchors the dimensional reasoning that leads to the $-5/3$ spectrum.")

def footer(canvas, doc):
    canvas.saveState(); canvas.setFont("CMR",9); canvas.setFillColor(colors.HexColor("#555555"))
    canvas.drawCentredString(letter[0]/2.0, 0.5*inch, str(doc.page)); canvas.restoreState()

doc = SimpleDocTemplate(os.path.join(WS,"sample-paper.pdf"), pagesize=letter,
    topMargin=0.9*inch, bottomMargin=0.9*inch, leftMargin=1.05*inch, rightMargin=1.05*inch,
    title="Energy Transfer and Spectral Structure in Turbulent Flows", author="Open Turbulence Collective")
doc.build(S, onFirstPage=footer, onLaterPages=footer)
print("built pages:", doc.page)
