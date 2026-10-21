// Hasi 3D / MS3D – nativer Kern (Sidecar). OCCT (LGPL-2.1 mit Ausnahme), dynamisch gelinkt.
// Aufruf: hasi-kern <eingabe.step> <ausgabe-ordner> [--threads N] [--pruefen] [--seriell]
// Ausgabe: modell.bin (JSON-Kopf + Binärdaten für die Anzeige) und modell.brep (Unikate als BREP für das Messen im WASM-Kern).
// Ablauf: STEP einmal parsen; Blatt-Teile (bei Mehrkörper-Teilen jeder Körper einzeln) parallel übersetzen;
// Baugruppen-Lagen aus CONTEXT_DEPENDENT_SHAPE_REPRESENTATION; Unikate parallel tessellieren und indizieren.
// Bei unbekannten Strukturen: serieller OCCT-Transfer (TransferRoots) als Rückfall.
#define _USE_MATH_DEFINES
#include <STEPControl_Reader.hxx>
#include <STEPControl_Controller.hxx>
#include <STEPControl_ActorRead.hxx>
#include <StepData_StepModel.hxx>
#include <StepData_Factors.hxx>
#include <StepBasic_ProductDefinition.hxx>
#include <StepRepr_NextAssemblyUsageOccurrence.hxx>
#include <StepRepr_ProductDefinitionShape.hxx>
#include <StepRepr_PropertyDefinition.hxx>
#include <StepRepr_CharacterizedDefinition.hxx>
#include <StepRepr_RepresentedDefinition.hxx>
#include <StepRepr_ShapeRepresentationRelationship.hxx>
#include <StepRepr_RepresentationRelationshipWithTransformation.hxx>
#include <StepRepr_Representation.hxx>
#include <StepRepr_RepresentationItem.hxx>
#include <StepShape_ShapeDefinitionRepresentation.hxx>
#include <StepShape_ContextDependentShapeRepresentation.hxx>
#include <StepShape_ManifoldSolidBrep.hxx>
#include <StepShape_ShellBasedSurfaceModel.hxx>
#include <StepShape_ConnectedFaceSet.hxx>
#include <XSControl_WorkSession.hxx>
#include <XSAlgo.hxx>
#include <XSAlgo_AlgoContainer.hxx>
#include <ShapeBuild_ReShape.hxx>
#include <ShapeFix.hxx>
#include <ShapeFix_Shape.hxx>
#include <ShapeFix_Face.hxx>
#include <ShapeFix_Wire.hxx>
#include <ShapeFix_Edge.hxx>
#include <ShapeAlgo.hxx>
#include <ShapeAlgo_AlgoContainer.hxx>
#include <ShapeAlgo_ToolContainer.hxx>
#include <ShapeAnalysis_Surface.hxx>
#include <ShapeAnalysis_Edge.hxx>
#include <ShapeExtend_WireData.hxx>
#include <ShapeConstruct_ProjectCurveOnSurface.hxx>
#include <Geom_Plane.hxx>
#include <Geom2d_Curve.hxx>
#include <TopExp.hxx>
#include <XSControl_TransferReader.hxx>
#include <Transfer_TransientProcess.hxx>
#include <TransferBRep.hxx>
#include <Interface_Static.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRep_Tool.hxx>
#include <BRep_Builder.hxx>
#include <BRepTools.hxx>
#include <BRepBndLib.hxx>
#include <Bnd_Box.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepAdaptor_Curve.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <Poly_Triangulation.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Iterator.hxx>
#include <TopoDS_Compound.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopLoc_Location.hxx>
#include <gp_Trsf.hxx>
#include <gp_Circ.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Pln.hxx>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <map>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <condition_variable>
#include <future>
#include <functional>
#include <unordered_map>
#include <vector>
#include <algorithm>
#include <array>

static auto T0 = std::chrono::steady_clock::now();
static long ms() { return (long)std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - T0).count(); }
static long hwmMB() {
#ifdef __linux__
  std::ifstream f("/proc/self/status"); std::string l; while (std::getline(f, l)) if (l.rfind("VmHWM", 0) == 0) return std::stol(l.substr(6)) / 1024;
#endif
  return -1;
}
// Fortschritt für die App (stdout, eine Zeile je Meldung): „STUFE <name> [k/n]“, „BIN <ms>“ sobald modell.bin fertig ist
static std::mutex stufeMx;
static void stufe(const char* name, long k = -1, long n = -1) { std::lock_guard<std::mutex> g(stufeMx); if (k >= 0) fprintf(stdout, "STUFE %s %ld/%ld\n", name, k, n); else fprintf(stdout, "STUFE %s\n", name); fflush(stdout); }
static void fehler(const std::string& m) { fprintf(stderr, "FEHLER: %s\n", m.c_str()); exit(2); }

// ---------- kleine JSON-Hilfen ----------
struct J { std::ostringstream s; bool first = true; };
static std::string num(double v) { if (!std::isfinite(v)) return "0"; char b[32]; snprintf(b, 32, "%.10g", v); return b; }
static std::string esc(const std::string& x) { std::string o; for (unsigned char c : x) { if (c == '"' || c == '\\') { o += '\\'; o += c; } else if (c < 32) { char b[8]; snprintf(b, 8, "\\u%04x", c); o += b; } else o += c; } return o; }
static std::string arr3(const gp_XYZ& p) { return "[" + num(p.X()) + "," + num(p.Y()) + "," + num(p.Z()) + "]"; }

static std::vector<double> trsfArr(const gp_Trsf& t) { std::vector<double> m; for (int r = 1; r <= 3; r++) for (int c = 1; c <= 4; c++) m.push_back(t.Value(r, c)); return m; }

// ---------- Ergebnisstrukturen ----------
struct Uniq { TopoDS_Shape shape; std::vector<float> p; std::vector<uint32_t> i, f; std::string facesJ, edgesJ, vertsJ; Bnd_Box bb; double vol = 0, area = 0; gp_XYZ c; int nf = 0, ne = 0, nv = 0; };
struct Inst { int u; gp_Trsf t; };
struct Item { int pd; int ent; int rep; bool whole; long cost; std::vector<TopoDS_Shape> out; };

// ---------- Formheilung aufgeschoben und parallel ----------
// OCCT heilt jede Form beim Übersetzen sofort (ShapeFix, vor allem fehlende Parameterkurven). Das ist bei großen Dateien
// der weitaus größte Teil der Zeit und läuft in einem Leser nur nacheinander. Hier merkt sich der Behälter die Aufrufe
// beim Übersetzen und die Heilung läuft danach mit denselben Parametern parallel (unabhängige Formen gleichzeitig,
// Formen mit gemeinsamen Kanten/Ecken zusammen, umschließende Formen danach in der ursprünglichen Reihenfolge).
// Parameterkurven-Vorrat: Die Heilung projiziert fehlende Parameterkurven Fläche für Fläche (der teuerste Teil, bei einem
// großen Körper nacheinander). Vorab werden dieselben Projektionen je Fläche parallel gerechnet – in derselben Reihenfolge
// und mit demselben Projektor-Zustand wie in ShapeFix_Wire. Die Heilung nimmt ein Ergebnis nur, wenn Fläche, Kurve,
// Bereich, Genauigkeit, Eckentoleranzen und der innere Zwischenspeicher des Projektors exakt übereinstimmen; sonst rechnet sie selbst.
struct ProjSchluessel { const void* surf; const void* c3d; double f, l, preci, tf, tl; int n; double c[10];
  bool operator==(const ProjSchluessel& o) const { return surf == o.surf && c3d == o.c3d && n == o.n && !memcmp(&f, &o.f, sizeof(double) * 5) && !memcmp(c, o.c, sizeof(c)); } };
struct ProjSchluesselHash { size_t operator()(const ProjSchluessel& k) const { size_t h = std::hash<const void*>()(k.surf) * 31 + std::hash<const void*>()(k.c3d);
  const double* d = &k.f; for (int i = 0; i < 5; i++) { uint64_t b; memcpy(&b, d + i, 8); h = h * 1000003u ^ std::hash<uint64_t>()(b); } return h; } };
struct ProjErgebnis { Handle(Geom_Curve) c3d; Handle(Geom2d_Curve) c2d; bool ok; int status; int n; gp_Pnt c3[2]; gp_Pnt2d c2[2]; };
using ProjVorrat = std::unordered_map<ProjSchluessel, ProjErgebnis, ProjSchluesselHash>;
static thread_local const ProjVorrat* projVorratLokal = nullptr; static std::atomic<long> projTreffer{0}, projFehl{0}; static thread_local long fehlLokal = 0;
class VorratProjektor : public ShapeConstruct_ProjectCurveOnSurface {
public:
  ProjSchluessel schluessel(const Handle(Geom_Curve)& c3d, double f, double l, double tf, double tl) const {
    ProjSchluessel k{}; k.surf = mySurf.IsNull() ? nullptr : mySurf->Surface().get(); k.c3d = c3d.get(); k.f = f; k.l = l; k.preci = myPreci; k.tf = tf; k.tl = tl; k.n = myNbCashe;
    for (int i = 0; i < myNbCashe && i < 2; i++) { k.c[i * 5] = myCashe3d[i].X(); k.c[i * 5 + 1] = myCashe3d[i].Y(); k.c[i * 5 + 2] = myCashe3d[i].Z(); k.c[i * 5 + 3] = myCashe2d[i].X(); k.c[i * 5 + 4] = myCashe2d[i].Y(); }
    return k; }
  ProjErgebnis rechne(Handle(Geom_Curve)& c3d, double f, double l, Handle(Geom2d_Curve)& c2d, double tf, double tl) {
    ProjErgebnis e; e.ok = ShapeConstruct_ProjectCurveOnSurface::Perform(c3d, f, l, c2d, tf, tl); e.c3d = c3d; e.c2d = c2d; e.status = myStatus; e.n = myNbCashe;
    for (int i = 0; i < 2; i++) { e.c3[i] = myCashe3d[i]; e.c2[i] = myCashe2d[i]; } return e; }
  Standard_Boolean Perform(Handle(Geom_Curve)& c3d, const Standard_Real f, const Standard_Real l, Handle(Geom2d_Curve)& c2d, const Standard_Real tf, const Standard_Real tl) override {
    if (projVorratLokal && !mySurf.IsNull()) { auto it = projVorratLokal->find(schluessel(c3d, f, l, tf, tl));
      if (it != projVorratLokal->end()) { const ProjErgebnis& e = it->second; projTreffer++;
        if (e.c3d.get() != c3d.get() && !e.c3d.IsNull()) c3d = Handle(Geom_Curve)::DownCast(e.c3d->Copy());
        c2d = e.c2d.IsNull() ? e.c2d : Handle(Geom2d_Curve)::DownCast(e.c2d->Copy()); myStatus = e.status; myNbCashe = e.n;
        for (int i = 0; i < 2; i++) { myCashe3d[i] = e.c3[i]; myCashe2d[i] = e.c2[i]; } return e.ok; } projFehl++; fehlLokal++; }
    return ShapeConstruct_ProjectCurveOnSurface::Perform(c3d, f, l, c2d, tf, tl); }
};
struct KantenZugriff : ShapeFix_Edge { static void projektor(ShapeFix_Edge& e, const Handle(ShapeConstruct_ProjectCurveOnSurface)& p) { e.*(&KantenZugriff::myProjector) = p; } };
// ShapeFix_Shape wie üblich, nur mit dem Vorrats-Projektor in der Kantenheilung
class VorratWerkzeuge : public ShapeAlgo_ToolContainer {
public:
  Handle(ShapeFix_Shape) FixShape() const override { Handle(ShapeFix_Shape) s = ShapeAlgo_ToolContainer::FixShape();
    Handle(ShapeFix_Edge) e = s->FixFaceTool()->FixWireTool()->FixEdgeTool(); if (!e.IsNull()) KantenZugriff::projektor(*e, new VorratProjektor); return s; }
};
// Vorab-Projektion einer Fläche (wie ShapeFix_Face/ShapeFix_Wire::FixEdgeCurves → ShapeFix_Edge::FixAddPCurve)
static void projiziereFlaeche(const TopoDS_Face& face, double prec, std::vector<std::pair<ProjSchluessel, ProjErgebnis>>& aus) {
  TopLoc_Location L; const Handle(Geom_Surface)& surf = BRep_Tool::Surface(face, L); if (surf.IsNull() || surf->IsKind(STANDARD_TYPE(Geom_Plane))) return;
  Handle(ShapeAnalysis_Surface) sas = new ShapeAnalysis_Surface(BRep_Tool::Surface(face)); Handle(VorratProjektor) pr = new VorratProjektor; ShapeAnalysis_Edge sae;
  std::unordered_map<const void*, int> gesehen;
  for (TopoDS_Iterator w(face, false); w.More(); w.Next()) { if (w.Value().ShapeType() != TopAbs_WIRE) continue;
    Handle(ShapeExtend_WireData) wd = new ShapeExtend_WireData(TopoDS::Wire(w.Value()));
    for (int i = 1; i <= wd->NbEdges(); i++) { TopoDS_Edge e = wd->Edge(i); bool seam = wd->IsSeam(i);
      if ((!seam && sae.HasPCurve(e, surf, L)) || (seam && sae.IsSeam(e, surf, L))) continue;
      if (gesehen[e.TShape().get()]++) continue; // in der Heilung hat die Kante dann schon ihre Parameterkurve
      double preci = prec > 0. ? prec : BRep_Tool::Tolerance(e); double f, l; Handle(Geom_Curve) c3d = BRep_Tool::Curve(e, f, l); if (c3d.IsNull()) continue;
      double tf = -1, tl = -1; TopoDS_Vertex v1, v2; TopExp::Vertices(e, v1, v2); if (!v1.IsNull()) tf = BRep_Tool::Tolerance(v1); if (!v2.IsNull()) tl = BRep_Tool::Tolerance(v2);
      pr->Init(sas, preci); ProjSchluessel k = pr->schluessel(c3d, f, l, tf, tl); Handle(Geom2d_Curve) c2d;
      try { aus.push_back({k, pr->rechne(c3d, f, l, c2d, tf, tl)}); } catch (...) { return; } } }
}

struct Aufschub { TopoDS_Shape s; double prec, tol; std::string rsc, seq; bool nm; TopAbs_ShapeEnum det; };
class Heiler : public XSAlgo_AlgoContainer {
public:
  std::atomic<bool> an{false};
  mutable std::mutex mx; mutable std::vector<Aufschub> liste;
  using XSAlgo_AlgoContainer::ProcessShape;
  TopoDS_Shape ProcessShape(const TopoDS_Shape& s, const Standard_Real p, const Standard_Real t, const Standard_CString rsc, const Standard_CString seq,
                            Handle(Standard_Transient)& info, const Handle(ShapeBuild_ReShape)& rs, const Message_ProgressRange& pr,
                            const Standard_Boolean nm, const TopAbs_ShapeEnum det) const override {
    if (!an || s.IsNull() || strncmp(seq, "read.", 5) != 0) return XSAlgo_AlgoContainer::ProcessShape(s, p, t, rsc, seq, info, rs, pr, nm, det);
    std::lock_guard<std::mutex> g(mx); liste.push_back({s, p, t, rsc, seq, (bool)nm, det}); return s;
  }
  TopoDS_Shape heile(const Aufschub& a) const { Handle(Standard_Transient) info; Handle(ShapeBuild_ReShape) rs = new ShapeBuild_ReShape();
    return XSAlgo_AlgoContainer::ProcessShape(a.s, a.prec, a.tol, a.rsc.c_str(), a.seq.c_str(), info, rs, Message_ProgressRange(), a.nm, a.det); }
};
// Heilt alle gemerkten Formen; Ergebnis: Ersetzungen (ungeheilt -> geheilt) für die Übersetzungsergebnisse.
static Handle(ShapeBuild_ReShape) heileParallel(const Heiler& H, int T, std::map<std::string, long>& times) {
  long t0 = ms(); std::vector<Aufschub> L; { std::lock_guard<std::mutex> g(H.mx); L.swap(H.liste); }
  Handle(ShapeBuild_ReShape) ers = new ShapeBuild_ReShape();
  const size_t n = L.size(); if (!n) return ers;
  std::unordered_map<const void*, size_t> wurzel; std::vector<char> doppelt(n, 0);
  for (size_t k = 0; k < n; k++) { auto r = wurzel.emplace(L[k].s.TShape().get(), k); if (!r.second) doppelt[k] = 1; }
  // umschließend = enthält eine andere gemerkte Form; gemeinsame Kanten/Ecken -> gleiche Gruppe (Union-Find)
  std::vector<char> aussen(n, 0); std::vector<size_t> par(n); for (size_t k = 0; k < n; k++) par[k] = k;
  std::function<size_t(size_t)> fnd = [&](size_t x) { while (par[x] != x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  std::vector<std::vector<const void*>> teile(n); std::vector<long> gewicht(n, 1);
  for (size_t k = 0; k < n; k++) { if (doppelt[k]) continue; TopTools_IndexedMapOfShape m; TopExp::MapShapes(L[k].s, m);
    for (int j = 1; j <= m.Extent(); j++) { const TopoDS_Shape& x = m(j); const void* p = x.TShape().get();
      if (x.ShapeType() <= TopAbs_FACE && j > 1) { auto w = wurzel.find(p); if (w != wurzel.end() && w->second != k) aussen[k] = 1; }
      if (x.ShapeType() == TopAbs_EDGE || x.ShapeType() == TopAbs_VERTEX) teile[k].push_back(p); if (x.ShapeType() == TopAbs_FACE) gewicht[k]++; } }
  std::unordered_map<const void*, size_t> besitzer;
  for (size_t k = 0; k < n; k++) { if (doppelt[k] || aussen[k]) continue; for (auto p : teile[k]) { auto r = besitzer.emplace(p, k); if (!r.second) { size_t a = fnd(k), b = fnd(r.first->second); if (a != b) par[a] = b; } } }
  std::map<size_t, std::vector<size_t>> gruppen; for (size_t k = 0; k < n; k++) if (!doppelt[k] && !aussen[k]) gruppen[fnd(k)].push_back(k);
  std::vector<std::vector<size_t>> G; for (auto& g : gruppen) G.push_back(g.second);
  std::vector<long> gw(G.size(), 0); for (size_t g = 0; g < G.size(); g++) for (auto k : G[g]) gw[g] += gewicht[k];
  std::vector<size_t> ord(G.size()); for (size_t g = 0; g < G.size(); g++) ord[g] = g; std::sort(ord.begin(), ord.end(), [&](size_t a, size_t b) { return gw[a] > gw[b]; });
  times["heilenPlanung"] = ms() - t0;
  // Vorab-Projektion: alle gekrümmten Flächen der unabhängigen Formen, größte zuerst, parallel
  // Gemeinsame Arbeitsliste: zuerst die Vorab-Projektionen der Flächen (größte Gruppen zuerst), eine Gruppe wird geheilt,
  // sobald alle ihre Flächen projiziert sind. Heilen hat Vorrang, damit große Körper früh fertig werden.
  const bool mitVorrat = !getenv("HASI_KERN_OHNE_VORRAT");
  struct FlAufgabe { TopoDS_Face f; double prec; size_t g; std::vector<std::pair<ProjSchluessel, ProjErgebnis>> erg; };
  std::vector<FlAufgabe> fl; std::vector<ProjVorrat> gVorrat(G.size()); std::vector<std::atomic<int>> offen(G.size());
  if (mitVorrat) { std::unordered_map<const void*, char> fs;
    for (size_t q = 0; q < ord.size(); q++) { size_t g = ord[q]; std::vector<FlAufgabe> eigene;
      for (auto k : G[g]) for (TopExp_Explorer e(L[k].s, TopAbs_FACE); e.More(); e.Next()) if (!fs[e.Current().TShape().get()]++) {
        TopLoc_Location lc; const Handle(Geom_Surface)& su = BRep_Tool::Surface(TopoDS::Face(e.Current()), lc); if (su.IsNull() || su->IsKind(STANDARD_TYPE(Geom_Plane))) continue;
        eigene.push_back({TopoDS::Face(e.Current()), L[k].prec, g, {}}); }
      offen[g] = (int)eigene.size(); for (auto& x : eigene) fl.push_back(std::move(x)); }
    // teuerste Flächen zuerst (Kantenzahl, Freiformflächen vierfach): der längste Einzelposten bestimmt sonst die Dauer
    std::vector<long> kost(fl.size()); for (size_t q = 0; q < fl.size(); q++) { long ne = 0; for (TopExp_Explorer e(fl[q].f, TopAbs_EDGE); e.More(); e.Next()) ne++;
      BRepAdaptor_Surface a(fl[q].f, false); auto ty = a.GetType(); kost[q] = ne * ((ty == GeomAbs_BSplineSurface || ty == GeomAbs_BezierSurface || ty == GeomAbs_OffsetSurface || ty == GeomAbs_OtherSurface) ? 4 : 1); }
    std::vector<size_t> fo(fl.size()); for (size_t q = 0; q < fl.size(); q++) fo[q] = q; std::stable_sort(fo.begin(), fo.end(), [&](size_t a, size_t b) { return kost[a] > kost[b]; });
    std::vector<FlAufgabe> fs2; fs2.reserve(fl.size()); for (auto q : fo) fs2.push_back(std::move(fl[q])); fl.swap(fs2); }
  else for (size_t g = 0; g < G.size(); g++) offen[g] = 0;
  std::vector<TopoDS_Shape> erg(n); std::atomic<size_t> fertig{0}; const size_t schritt = std::max<size_t>(1, ord.size() / 20);
  std::mutex qmx; std::condition_variable qcv; std::vector<size_t> bereit; size_t flNext = 0, heilOffen = ord.size();
  { std::lock_guard<std::mutex> g(qmx); for (size_t q = ord.size(); q-- > 0;) if (offen[ord[q]] == 0) bereit.push_back(ord[q]); } // Stapel: größte zuletzt eingelegt = zuerst
  std::reverse(bereit.begin(), bereit.end());
  stufe("heilen", 0, (long)ord.size());
  auto heileGruppe = [&](size_t g) { projVorratLokal = mitVorrat ? &gVorrat[g] : nullptr;
    for (auto k : G[g]) { long tk = ms(); fehlLokal = 0; try { erg[k] = H.heile(L[k]); } catch (...) { erg[k] = L[k].s; }
      if (getenv("HASI_KERN_PROFIL") && ms() - tk > 200) fprintf(stderr, "  heilen %zu: flaechen=%ld zeit=%ld start=%ld fehl=%ld\n", k, gewicht[k] - 1, ms() - tk, tk, fehlLokal); }
    projVorratLokal = nullptr; ProjVorrat().swap(gVorrat[g]);
    size_t f = ++fertig; if (f % schritt == 0 || f == ord.size()) stufe("heilen", (long)f, (long)ord.size()); };
  auto work = [&] { for (;;) { int art = 0; size_t idx = 0;
      { std::unique_lock<std::mutex> lk(qmx);
        qcv.wait(lk, [&] { return !bereit.empty() || flNext < fl.size() || heilOffen == 0; });
        // Heilen, wenn die bereite Gruppe mindestens so groß ist wie die Gruppe der nächsten Fläche; sonst erst projizieren
        if (!bereit.empty() && (flNext >= fl.size() || gw[bereit.front()] >= gw[fl[flNext].g])) { art = 1; idx = bereit.front(); bereit.erase(bereit.begin()); heilOffen--; }
        else if (flNext < fl.size()) { art = 2; idx = flNext++; }
        else return; }
      if (art == 1) { heileGruppe(idx); std::lock_guard<std::mutex> lk(qmx); qcv.notify_all(); continue; }
      FlAufgabe& a = fl[idx]; long tq = ms(); try { projiziereFlaeche(a.f, a.prec, a.erg); } catch (...) {}
      if (getenv("HASI_KERN_PROFIL") && ms() - tq > 100) fprintf(stderr, "  vorrat flaeche %zu: proj=%zu zeit=%ld start=%ld\n", idx, a.erg.size(), ms() - tq, tq);
      std::lock_guard<std::mutex> lk(qmx); for (auto& x : a.erg) gVorrat[a.g].emplace(x.first, x.second); a.erg.clear();
      if (--offen[a.g] == 0) { // in Größenreihenfolge einsortieren
        size_t pos = 0; while (pos < bereit.size() && gw[bereit[pos]] >= gw[a.g]) pos++; bereit.insert(bereit.begin() + pos, a.g); }
      qcv.notify_all(); } };
  long t1 = ms();
  { std::vector<std::thread> th; for (int k = 0; k < std::max(1, T); k++) th.emplace_back(work); for (auto& t : th) t.join(); }
  for (size_t k = 0; k < n; k++) if (!doppelt[k] && !aussen[k] && !erg[k].IsNull() && !erg[k].IsSame(L[k].s)) ers->Replace(L[k].s, erg[k]);
  times["heilenParallel"] = ms() - t1; times["heilenVorratFlaechen"] = (long)fl.size(); long t2 = ms(); int na = 0;
  times["heilenTreffer"] = projTreffer.load(); times["heilenFehl"] = projFehl.load();
  for (size_t k = 0; k < n; k++) if (aussen[k]) { na++; TopoDS_Shape s = ers->Apply(L[k].s, TopAbs_FACE); Aufschub a = L[k]; a.s = s; TopoDS_Shape r; try { r = H.heile(a); } catch (...) { r = s; }
      if (!r.IsNull() && !r.IsSame(L[k].s)) ers->Replace(L[k].s, r); }
  times["heilenAussen"] = ms() - t2; times["heilenFormen"] = (long)n; times["heilenGruppen"] = (long)G.size();
  return ers;
}

// Solids wie im JS-Kern (occTree/allSolids): Volumenkörper mit kumulierter Lage; sonst SOLID-Exploration; Schale als Rückfall
static void allSolids(const TopoDS_Shape& sh, std::vector<TopoDS_Shape>& out) {
  if (sh.IsNull()) return;
  if (sh.ShapeType() == TopAbs_SOLID) { out.push_back(sh); return; }
  if (sh.ShapeType() == TopAbs_COMPOUND || sh.ShapeType() == TopAbs_COMPSOLID) { for (TopoDS_Iterator it(sh, true, true); it.More(); it.Next()) allSolids(it.Value(), out); return; }
  size_t n0 = out.size(); for (TopExp_Explorer e(sh, TopAbs_SOLID); e.More(); e.Next()) out.push_back(e.Current());
  if (out.size() == n0 && sh.ShapeType() == TopAbs_SHELL) out.push_back(sh);
}

int main(int argc, char** argv) {
  if (argc < 3) { fprintf(stderr, "Aufruf: hasi-kern <eingabe.step> <ausgabe-ordner> [--threads N] [--pruefen] [--seriell]\n"); return 1; }
  std::string in = argv[1], outDir = argv[2]; int T = std::max(1u, std::thread::hardware_concurrency()); bool pruefen = false, seriell = false; int splitMin = 2;
  for (int k = 3; k < argc; k++) { if (!strcmp(argv[k], "--threads") && k + 1 < argc) T = std::max(1, atoi(argv[++k])); else if (!strcmp(argv[k], "--pruefen")) pruefen = true; else if (!strcmp(argv[k], "--seriell")) seriell = true; else if (!strcmp(argv[k], "--split-min") && k + 1 < argc) splitMin = atoi(argv[++k]); }
  std::map<std::string, long> times; long tl = ms(); auto lap = [&](const char* k) { times[k] = ms() - tl; tl = ms(); };

  // Übersetzer-Threads parsen die Datei je selbst (gemeinsames Modell ist in OCCT nicht threadsicher)
  int TT = T; for (int k = 3; k < argc; k++) if (!strcmp(argv[k], "--transfer-threads") && k + 1 < argc) TT = std::max(1, atoi(argv[++k]));
  if (TT > 3 && !getenv("HASI_KERN_VIELE")) TT = std::min(TT, 3); // mehr Leser kosten je ~150–250 MB, bringen wegen des seriellen Parsens kaum Zeit
  std::vector<Item> items; std::vector<int> order; std::atomic<size_t> next{0}; std::atomic<int> fehlerZahl{0};
  std::promise<bool> planP; std::shared_future<bool> plan = planP.get_future().share();
  STEPControl_Controller::Init(); // globale Einstellungen einmal vor den Threads anlegen
  { STEPControl_Reader warm; (void)warm; }
  bool sofortHeilen = getenv("HASI_KERN_SOFORT_HEILEN") != nullptr; for (int k = 3; k < argc; k++) if (!strcmp(argv[k], "--sofort-heilen")) sofortHeilen = true;
  Handle(Heiler) heiler = new Heiler; XSAlgo::SetAlgoContainer(heiler);
  ShapeAlgo::AlgoContainer()->SetToolContainer(new VorratWerkzeuge);
  if (!sofortHeilen) TT = 1; // ein Leser genügt: das Übersetzen ohne Heilung ist schnell, die Heilung läuft danach parallel
  if (const char* pv = getenv("HASI_KERN_PARAM")) { std::stringstream ss(pv); std::string kv; while (std::getline(ss, kv, ';')) { auto e = kv.find('='); if (e != std::string::npos) Interface_Static::SetCVal(kv.substr(0, e).c_str(), kv.substr(e + 1).c_str()); } }
  // Übersetzen einer Arbeitsliste mit eigenem Leser (eigenes Modell, eigener TransientProcess)
  auto transferLoop = [&](STEPControl_Reader& r) {
      Handle(StepData_StepModel) m = r.StepModel();
      Handle(XSControl_TransferReader) trd = r.WS()->TransferReader(); trd->BeginTransfer();
      Handle(Transfer_TransientProcess) TP = trd->TransientProcess();
      Handle(STEPControl_ActorRead) act = Handle(STEPControl_ActorRead)::DownCast(trd->Actor());
      for (;;) { size_t n = next++; if (n >= order.size()) break; Item& it = items[order[n]]; long tI = ms();
        try {
          if (it.whole) { if (r.TransferEntity(m->Value(it.ent))) { TopoDS_Shape s = r.Shape(r.NbShapes()); it.out.push_back(s); } }
          else { StepData_Factors f; auto rep = Handle(StepRepr_Representation)::DownCast(m->Value(it.rep)); act->PrepareUnits(rep, TP, f); Handle(Transfer_Binder) b = act->TransferShape(m->Value(it.ent), TP, f); TopoDS_Shape s = TransferBRep::ShapeResult(b); if (!s.IsNull()) it.out.push_back(s); else fehlerZahl++; }
        } catch (...) { fehlerZahl++; }
        if (getenv("HASI_KERN_PROFIL") && ms() - tI > 400) fprintf(stderr, "  item pd=%d ganz=%d kosten=%ld zeit=%ld start=%ld\n", it.pd, (int)it.whole, it.cost, ms() - tI, tI);
      }
  };
  std::vector<std::thread> th;
  // Das Parsen ist in OCCT nicht threadsicher (globale Bibliothekslisten in Interface_GeneralLib/ReaderLib) und läuft
  // deshalb nacheinander: zuerst der Haupt-Thread (Planung, dann übersetzt er selbst mit), danach die weiteren Leser,
  // die jeweils sofort mit dem Übersetzen beginnen, während der nächste parst.
  std::mutex parseMx; std::unique_lock<std::mutex> mainParse(parseMx);
  if (!seriell) for (int k = 0; k < TT - 1; k++) th.emplace_back([&] {
      STEPControl_Reader r; { std::lock_guard<std::mutex> g(parseMx); if (r.ReadFile(in.c_str()) != IFSelect_RetDone) { fehlerZahl++; return; } r.WS()->Graph(); }
      if (!plan.get()) return;
      transferLoop(r);
    });
  STEPControl_Reader main; stufe("lesen");
  if (main.ReadFile(in.c_str()) != IFSelect_RetDone) fehler("STEP-Datei konnte nicht gelesen werden");
  main.WS()->Graph(); // Graph (Interface_GeneralLib) ebenfalls unter der Sperre aufbauen
  mainParse.unlock();
  Handle(StepData_StepModel) model = main.StepModel(); lap("lesen");
  const int N = model->NbEntities();

  // ---------- Produktstruktur ----------
  std::unordered_map<int, std::vector<int>> nauoOf;        // Eltern-PD -> NAUO-Entitäten (sortiert)
  std::unordered_map<int, int> pdsOfDef;                    // PD- oder NAUO-Nummer -> PRODUCT_DEFINITION_SHAPE
  std::unordered_map<int, Handle(StepRepr_Representation)> repOfPds; // PDS -> Darstellung (SDR)
  std::unordered_map<int, Handle(StepShape_ContextDependentShapeRepresentation)> cdsrOfPds;
  std::vector<std::pair<Handle(StepRepr_Representation), Handle(StepRepr_Representation)>> srr; // Formbeziehungen ohne Transformation
  std::vector<int> pds; std::unordered_map<int, int> nauoChild;
  bool unbekannt = false;
  for (int i = 1; i <= N; i++) {
    const Handle(Standard_Transient)& e = model->Value(i);
    if (e->IsKind(STANDARD_TYPE(StepRepr_NextAssemblyUsageOccurrence))) { auto a = Handle(StepRepr_NextAssemblyUsageOccurrence)::DownCast(e); nauoOf[model->Number(a->RelatingProductDefinition())].push_back(i); nauoChild[i] = model->Number(a->RelatedProductDefinition()); }
    else if (e->IsKind(STANDARD_TYPE(StepBasic_ProductDefinition))) pds.push_back(i);
    else if (e->IsKind(STANDARD_TYPE(StepRepr_ProductDefinitionShape))) { auto p = Handle(StepRepr_ProductDefinitionShape)::DownCast(e); StepRepr_CharacterizedDefinition d = p->Definition(); Handle(Standard_Transient) v = d.Value(); if (!v.IsNull()) pdsOfDef[model->Number(v)] = i; }
    else if (e->IsKind(STANDARD_TYPE(StepShape_ShapeDefinitionRepresentation))) { auto s = Handle(StepShape_ShapeDefinitionRepresentation)::DownCast(e); auto pd = s->Definition().PropertyDefinition(); if (!pd.IsNull()) repOfPds[model->Number(pd)] = s->UsedRepresentation(); }
    else if (e->IsKind(STANDARD_TYPE(StepShape_ContextDependentShapeRepresentation))) { auto c = Handle(StepShape_ContextDependentShapeRepresentation)::DownCast(e); cdsrOfPds[model->Number(c->RepresentedProductRelation())] = c; }
    else if (e->IsKind(STANDARD_TYPE(StepRepr_ShapeRepresentationRelationship)) && !e->IsKind(STANDARD_TYPE(StepRepr_RepresentationRelationshipWithTransformation))) { auto r = Handle(StepRepr_ShapeRepresentationRelationship)::DownCast(e); srr.push_back({r->Rep1(), r->Rep2()}); }
  }
  for (auto& kv : nauoOf) std::sort(kv.second.begin(), kv.second.end());
  auto repOfPd = [&](int pd) -> Handle(StepRepr_Representation) { auto a = pdsOfDef.find(pd); if (a == pdsOfDef.end()) return nullptr; auto b = repOfPds.find(a->second); return b == repOfPds.end() ? nullptr : b->second; };
  lap("struktur");

  // ---------- Arbeitsliste: Blatt-Teile, Mehrkörper-Teile in Körper aufgeteilt ----------
  std::unordered_map<int, std::vector<int>> itemsOfPd;
  auto faceCount = [&](const Handle(Standard_Transient)& it) -> long {
    if (it->IsKind(STANDARD_TYPE(StepShape_ManifoldSolidBrep))) { auto o = Handle(StepShape_ManifoldSolidBrep)::DownCast(it)->Outer(); return o.IsNull() ? 1 : o->NbCfsFaces(); }
    return 1; };
  std::vector<int> leafPds; for (int pd : pds) if (!nauoOf.count(pd)) leafPds.push_back(pd);
  for (int pd : leafPds) {
    Handle(StepRepr_Representation) rep = repOfPd(pd);
    // Körper der Darstellung (direkt oder über SHAPE_REPRESENTATION_RELATIONSHIP ohne Transformation)
    std::vector<std::pair<Handle(Standard_Transient), Handle(StepRepr_Representation)>> bodies; bool ok = !rep.IsNull();
    auto collect = [&](const Handle(StepRepr_Representation)& r) { for (int k = 1; k <= r->NbItems(); k++) { auto it = r->ItemsValue(k); if (it->IsKind(STANDARD_TYPE(StepShape_ManifoldSolidBrep))) bodies.push_back({it, r}); } };
    if (ok) { collect(rep); for (auto& s : srr) { if (s.first == rep) collect(s.second); else if (s.second == rep) collect(s.first); } }
    if (ok && (int)bodies.size() >= splitMin) {
      for (auto& b : bodies) { Item x{pd, model->Number(b.first), model->Number(b.second), false, faceCount(b.first), {}}; itemsOfPd[pd].push_back(items.size()); items.push_back(x); }
    } else { long c = 0; for (auto& b : bodies) c += faceCount(b.first); Item x{pd, pd, rep.IsNull() ? 0 : model->Number(rep), true, std::max(1L, c), {}}; itemsOfPd[pd].push_back(items.size()); items.push_back(x); }
  }
  // Baugruppen-Lagen
  std::unordered_map<int, gp_Trsf> nauoTrsf;
  {
    Handle(STEPControl_ActorRead) act = Handle(STEPControl_ActorRead)::DownCast(main.WS()->TransferReader()->Actor());
    main.WS()->TransferReader()->BeginTransfer(); Handle(Transfer_TransientProcess) TP = main.WS()->TransferReader()->TransientProcess();
    for (auto& kv : nauoChild) {
      int nauo = kv.first, child = kv.second; auto p = pdsOfDef.find(nauo); if (p == pdsOfDef.end()) { unbekannt = true; continue; }
      auto c = cdsrOfPds.find(p->second); if (c == cdsrOfPds.end()) { unbekannt = true; continue; }
      Handle(StepRepr_RepresentationRelationship) rr = c->second->RepresentationRelation(); gp_Trsf tr; StepData_Factors f;
      if (act.IsNull() || !rr->IsKind(STANDARD_TYPE(StepRepr_RepresentationRelationshipWithTransformation))) { unbekannt = true; continue; }
      act->ComputeSRRWT(rr, TP, tr, f);
      // Rep1 gehört normalerweise zum Kind; sonst umgekehrte Richtung
      Handle(StepRepr_Representation) cr = repOfPd(child);
      bool rev = !cr.IsNull() && rr->Rep2() == cr && rr->Rep1() != cr;
      nauoTrsf[nauo] = rev ? tr.Inverted() : tr;
    }
  }
  if (seriell) unbekannt = true;
  lap("planung");

  // ---------- paralleles Übersetzen ----------
  order.resize(items.size()); for (size_t k = 0; k < items.size(); k++) order[k] = k;
  std::sort(order.begin(), order.end(), [&](int a, int b) { return items[a].cost > items[b].cost; });
  planP.set_value(!unbekannt); stufe("uebersetzen");
  // Regularität (Kantenstetigkeit) setzt OCCT bei ganzen Teilen nach der Heilung; beim Aufschieben daher erst danach
  const double tolang = Interface_Static::RVal("read.encoderegularity.angle");
  if (!unbekannt && !sofortHeilen) Interface_Static::SetRVal("read.encoderegularity.angle", 0);
  if (!unbekannt) { heiler->an = !sofortHeilen; transferLoop(main); }
  if (!unbekannt && !sofortHeilen) Interface_Static::SetRVal("read.encoderegularity.angle", tolang);
  for (auto& t : th) t.join();
  heiler->an = false;
  lap("uebersetzen");
  if (!unbekannt && !sofortHeilen) {
    Handle(ShapeBuild_ReShape) ers = heileParallel(*heiler, T, times);
    long tA = ms(); for (auto& it : items) for (auto& s : it.out) { s = ers->Apply(s, TopAbs_FACE); if (it.whole && tolang > 0 && !s.IsNull()) ShapeFix::EncodeRegularity(s, tolang); }
    times["heilenAnwenden"] = ms() - tA;
    lap("heilen");
  }

  // ---------- Unikate und Instanzen ----------
  std::vector<Uniq> U; std::vector<Inst> I; TopTools_IndexedMapOfShape uniqMap; // Basisform (ohne Lage) -> Unikat
  // Ausgabe der Struktur: je PD Kinder-Lagen und Körper
  std::ostringstream pdJ; pdJ << "{";
  bool firstPd = true; std::unordered_map<int, std::vector<std::pair<int, gp_Trsf>>> bodiesOfPd; // PD -> (Unikat, lokale Lage)
  auto addUniq = [&](const TopoDS_Shape& sol) -> std::pair<int, gp_Trsf> {
    TopLoc_Location loc = sol.Location(); TopoDS_Shape base = sol.Located(TopLoc_Location());
    int k = uniqMap.FindIndex(base); if (!k) { k = uniqMap.Add(base); Uniq u; u.shape = base; U.push_back(std::move(u)); }
    return {k - 1, loc.Transformation()}; };
  std::string serialTree;
  if (!unbekannt) {
    for (int pd : leafPds) for (int ix : itemsOfPd[pd]) for (auto& s : items[ix].out) { std::vector<TopoDS_Shape> ss; allSolids(s, ss); for (auto& x : ss) bodiesOfPd[pd].push_back(addUniq(x)); }
  } else {
    // Rückfall: serieller Transfer, Baum wie im JS-Kern (OCCT-Struktur)
    main.TransferRoots(); TopoDS_Shape shape = main.OneShape(); lap("uebersetzen");
    std::function<std::string(const TopoDS_Shape&)> walk = [&](const TopoDS_Shape& sh) -> std::string {
      std::ostringstream o; o << "{\"kids\":[";
      std::vector<TopoDS_Shape> sol; bool comp = sh.ShapeType() == TopAbs_COMPOUND || sh.ShapeType() == TopAbs_COMPSOLID;
      if (comp) { bool f = true; for (TopoDS_Iterator it(sh, true, true); it.More(); it.Next()) { if (it.Value().ShapeType() == TopAbs_SOLID) { sol.push_back(it.Value()); continue; } o << (f ? "" : ",") << walk(it.Value()); f = false; } }
      else allSolids(sh, sol);
      o << "],\"solids\":["; bool f = true; for (auto& s : sol) { auto ut = addUniq(s); I.push_back({ut.first, ut.second}); o << (f ? "" : ",") << (I.size() - 1); f = false; }
      o << "]}"; return o.str(); };
    // Hinweis: im JS-Kern werden Solids in Compounds als eigene Kinder geführt; hier zur Vereinfachung als solids des Knotens
    serialTree = walk(shape);
  }
  lap("zuordnen");

  // Strukturausgabe (paralleler Pfad): PD -> {kids:[[kindPD, nauo, m12]], bodies:[[u, m12]]}
  if (!unbekannt) {
    for (int pd : pds) {
      bool has = nauoOf.count(pd) || bodiesOfPd.count(pd); if (!has) continue;
      pdJ << (firstPd ? "" : ",") << "\"" << model->IdentLabel(model->Value(pd)) << "\":{\"kids\":["; firstPd = false; bool f = true;
      if (nauoOf.count(pd)) for (int na : nauoOf[pd]) { gp_Trsf t; auto q = nauoTrsf.find(na); if (q != nauoTrsf.end()) t = q->second; auto m = trsfArr(t);
          pdJ << (f ? "" : ",") << "[" << model->IdentLabel(model->Value(nauoChild[na])) << "," << model->IdentLabel(model->Value(na)) << ",["; for (int z = 0; z < 12; z++) pdJ << (z ? "," : "") << num(m[z]); pdJ << "]]"; f = false; }
      pdJ << "],\"bodies\":["; f = true;
      for (auto& b : bodiesOfPd[pd]) { auto m = trsfArr(b.second); pdJ << (f ? "" : ",") << "[" << b.first << ",["; for (int z = 0; z < 12; z++) pdJ << (z ? "," : "") << num(m[z]); pdJ << "]]"; f = false; }
      pdJ << "]}";
    }
  }
  pdJ << "}";

  // ---------- Tessellieren und indizieren (parallel über Unikate) ----------
  stufe("tessellieren", 0, (long)U.size());
  Bnd_Box all; for (auto& u : U) { BRepBndLib::Add(u.shape, u.bb, true); }
  if (!unbekannt) { // Gesamt-Bounding-Box über Instanzen: grob aus Unikaten (für die Feinheit genügt das)
    for (auto& u : U) all.Add(u.bb); } else for (auto& u : U) all.Add(u.bb);
  double diag = all.IsVoid() ? 1 : sqrt(all.SquareExtent()); if (diag <= 0) diag = 1;
  std::vector<int> uo(U.size()); for (size_t k = 0; k < U.size(); k++) uo[k] = k;
  std::sort(uo.begin(), uo.end(), [&](int a, int b) { return U[a].bb.SquareExtent() > U[b].bb.SquareExtent(); });
  std::atomic<size_t> nx{0}, meshFertig{0}; const size_t meshSchritt = std::max<size_t>(1, uo.size() / 20);
  auto work = [&] {
    for (;;) { size_t n = nx++; if (n >= uo.size()) break; Uniq& u = U[uo[n]]; long tA = ms(); long tM = 0;
      double d = u.bb.IsVoid() ? diag : sqrt(u.bb.SquareExtent()); if (d <= 0) d = diag;
      double defl = std::min(std::max(d / 600, diag / 20000), diag / 1500);
      int nfa = 0; for (TopExp_Explorer e(u.shape, TopAbs_FACE); e.More(); e.Next()) nfa++;
      BRepMesh_IncrementalMesh(u.shape, defl, false, 0.35, nfa > 300); tM = ms() - tA;
      TopTools_IndexedMapOfShape faces, edges, verts; std::vector<std::vector<int>> edgeFaces;
      std::ostringstream fj, ej, vj; fj << "["; ej << "[";
      for (TopExp_Explorer ex(u.shape, TopAbs_FACE); ex.More(); ex.Next()) {
        TopoDS_Face f = TopoDS::Face(ex.Current()); int fi = faces.FindIndex(f); bool isNew = !fi; if (isNew) fi = faces.Add(f); fi -= 1;
        if (isNew) { // Flächeninfo wie faceInfo (Typ, Zylinderachse)
          BRepAdaptor_Surface a(f, true); auto t = a.GetType(); const char* ty = "sonstige"; std::string ax;
          if (t == GeomAbs_Plane) ty = "eben"; else if (t == GeomAbs_Cylinder) { ty = "zylindrisch"; gp_Cylinder c = a.Cylinder(); ax = ",\"ax\":{\"c\":" + arr3(c.Location().XYZ()) + ",\"d\":" + arr3(c.Axis().Direction().XYZ()) + ",\"r\":" + num(c.Radius()) + "}"; }
          else if (t == GeomAbs_Cone) ty = "kegelig"; else if (t == GeomAbs_Sphere) ty = "kugelig"; else if (t == GeomAbs_Torus) ty = "torisch"; else ty = "Freiform";
          fj << (fi ? "," : "") << "{\"type\":\"" << ty << "\"" << ax << "}"; }
        TopLoc_Location loc; Handle(Poly_Triangulation) tri = BRep_Tool::Triangulation(f, loc);
        if (!tri.IsNull()) { gp_Trsf tr = loc.Transformation(); uint32_t base = u.p.size() / 3; bool rev = f.Orientation() == TopAbs_REVERSED;
          for (int k = 1; k <= tri->NbNodes(); k++) { gp_Pnt q = tri->Node(k).Transformed(tr); u.p.push_back((float)q.X()); u.p.push_back((float)q.Y()); u.p.push_back((float)q.Z()); }
          for (int k = 1; k <= tri->NbTriangles(); k++) { int a, b, c; tri->Triangle(k).Get(a, b, c); if (rev) std::swap(b, c); u.i.push_back(base + a - 1); u.i.push_back(base + b - 1); u.i.push_back(base + c - 1); u.f.push_back(fi); } }
        for (TopExp_Explorer ee(f, TopAbs_EDGE); ee.More(); ee.Next()) { int ei = edges.FindIndex(ee.Current()); if (!ei) { ei = edges.Add(ee.Current()); edgeFaces.emplace_back(); } auto& ef = edgeFaces[ei - 1]; if (std::find(ef.begin(), ef.end(), fi) == ef.end()) ef.push_back(fi); }
      }
      fj << "]";
      for (int k = 1; k <= edges.Extent(); k++) { // Kanteninfo wie edgeInfo
        TopoDS_Edge e = TopoDS::Edge(edges(k)); std::ostringstream o; o << (k > 1 ? "," : "") << "{";
        if (BRep_Tool::Degenerated(e)) { o << "\"type\":\"Kurve\",\"pts\":[]" << ",\"mid\":[0,0,0]}"; ej << o.str(); continue; }
        BRepAdaptor_Curve a(e); auto t = a.GetType(); double u0 = a.FirstParameter(), u1 = a.LastParameter(); int n = 24; const char* ty = "Kurve"; std::string ex;
        if (t == GeomAbs_Line) { ty = "Gerade"; n = 1; }
        else if (t == GeomAbs_Circle) { ty = "Kreis"; gp_Circ c = a.Circle(); double ang = fabs(u1 - u0); n = std::max(8, (int)ceil(ang / (M_PI / 24))); ex = ",\"c\":" + arr3(c.Location().XYZ()) + ",\"n\":" + arr3(c.Axis().Direction().XYZ()) + ",\"r\":" + num(c.Radius()); }
        o << "\"type\":\"" << ty << "\"" << ex << ",\"pts\":["; for (int z = 0; z <= n; z++) o << (z ? "," : "") << arr3(a.Value(u0 + (u1 - u0) * z / n).XYZ());
        o << "],\"mid\":" << arr3(a.Value((u0 + u1) / 2).XYZ()) << "}"; ej << o.str(); }
      ej << "]";
      for (TopExp_Explorer ev(u.shape, TopAbs_VERTEX); ev.More(); ev.Next()) verts.Add(ev.Current());
      vj << "["; for (int k = 1; k <= verts.Extent(); k++) vj << (k > 1 ? "," : "") << arr3(BRep_Tool::Pnt(TopoDS::Vertex(verts(k))).XYZ()); vj << "]";
      long tE = ms();
      if (getenv("HASI_KERN_PROPS")) { GProp_GProps gv, gs; BRepGProp::VolumeProperties(u.shape, gv); BRepGProp::SurfaceProperties(u.shape, gs); u.vol = fabs(gv.Mass()); u.c = gv.CentreOfMass().XYZ(); u.area = gs.Mass(); }
      tE = ms() - tE;
      u.facesJ = fj.str(); u.edgesJ = ej.str(); u.vertsJ = vj.str(); u.nf = faces.Extent(); u.ne = edges.Extent(); u.nv = verts.Extent();
      if (getenv("HASI_KERN_PROFIL") && ms() - tA > 300) fprintf(stderr, "  unikat %d: faces=%d mesh=%ld props=%ld gesamt=%ld tri=%zu\n", uo[n], u.nf, tM, tE, ms() - tA, u.f.size());
      size_t fm = ++meshFertig; if (fm % meshSchritt == 0 || fm == uo.size()) stufe("tessellieren", (long)fm, (long)uo.size());
    } };
  { std::vector<std::thread> th; for (int k = 0; k < T; k++) th.emplace_back(work); for (auto& t : th) t.join(); }
  lap("tessellieren");

  // ---------- Ausgabe ----------
  std::ostringstream js; uint64_t off = 0; std::vector<std::pair<const void*, size_t>> blobs;
  auto blob = [&](const void* p, size_t n) { std::string r = "[" + std::to_string(off) + "," + std::to_string(n) + "]"; blobs.push_back({p, n}); off += n; while (off % 4) { off++; blobs.push_back({nullptr, 1}); } return r; };
  js << "{\"version\":1,\"modus\":\"" << (unbekannt ? "seriell" : "parallel") << "\",\"threads\":" << T << ",\"fehler\":" << fehlerZahl.load() << ",\"uniq\":[";
  for (size_t k = 0; k < U.size(); k++) { auto& u = U[k]; gp_XYZ a, b; double x0, y0, z0, x1, y1, z1; if (u.bb.IsVoid()) { x0 = y0 = z0 = x1 = y1 = z1 = 0; } else u.bb.Get(x0, y0, z0, x1, y1, z1);
    js << (k ? "," : "") << "{\"p\":" << blob(u.p.data(), u.p.size() * 4) << ",\"i\":" << blob(u.i.data(), u.i.size() * 4) << ",\"f\":" << blob(u.f.data(), u.f.size() * 4)
       << ",\"faces\":" << u.facesJ << ",\"edges\":" << u.edgesJ << ",\"verts\":" << u.vertsJ << ",\"n\":[" << u.nf << "," << u.ne << "," << u.nv << "]"
       << ",\"bb\":{\"min\":[" << num(x0) << "," << num(y0) << "," << num(z0) << "],\"max\":[" << num(x1) << "," << num(y1) << "," << num(z1) << "]},\"vp\":{\"v\":" << num(u.vol) << ",\"a\":" << num(u.area) << ",\"c\":" << arr3(u.c) << "}}"; }
  js << "]";
  if (unbekannt) { js << ",\"tree\":" << serialTree << ",\"inst\":["; for (size_t k = 0; k < I.size(); k++) { auto m = trsfArr(I[k].t); js << (k ? "," : "") << "{\"u\":" << I[k].u << ",\"m\":["; for (int z = 0; z < 12; z++) js << (z ? "," : "") << num(m[z]); js << "]}"; } js << "]"; }
  else js << ",\"pd\":" << pdJ.str();
  times["gesamt"] = ms(); times["speicherMB"] = hwmMB();
  js << ",\"times\":{"; bool f = true; for (auto& kv : times) { js << (f ? "" : ",") << "\"" << kv.first << "\":" << kv.second; f = false; } js << "}}";
  std::string head = js.str(); std::ofstream o(outDir + "/modell.bin", std::ios::binary); uint32_t hl = head.size(); o.write((char*)&hl, 4); o.write(head.data(), hl);
  static const char z4[4] = {0, 0, 0, 0}; while ((4 + hl) % 4) { hl++; o.write(z4, 1); }
  for (auto& b : blobs) { if (b.first) o.write((const char*)b.first, b.second); else o.write(z4, b.second); }
  o.close();
  // Die App kann jetzt anzeigen; modell.brep (für das Messen) folgt
  fprintf(stdout, "BIN %ld\n", ms()); fflush(stdout);
  { long tB = ms(); BRep_Builder bb; TopoDS_Compound c; bb.MakeCompound(c); for (auto& u : U) bb.Add(c, u.shape);
    std::ofstream f(outDir + "/modell.brep"); BRepTools::Write(c, f, false, false, TopTools_FormatVersion_VERSION_1); times["brep"] = ms() - tB; }
  if (pruefen && !unbekannt) { // Abgleich mit dem seriellen OCCT-Transfer: Welt-Bounding-Boxen aller Instanzen
    std::unordered_map<int, bool> isChild; for (auto& kv : nauoChild) isChild[kv.second] = true;
    std::vector<std::array<double, 6>> A, B;
    auto bbOf = [&](int u, const gp_Trsf& t) { Bnd_Box b; BRepBndLib::Add(U[u].shape.Moved(TopLoc_Location(t)), b, false); double x0, y0, z0, x1, y1, z1; b.Get(x0, y0, z0, x1, y1, z1); return std::array<double, 6>{x0, y0, z0, x1, y1, z1}; };
    std::function<void(int, const gp_Trsf&)> walkPd = [&](int pd, const gp_Trsf& w) {
      for (auto& b : bodiesOfPd[pd]) A.push_back(bbOf(b.first, w * b.second));
      if (nauoOf.count(pd)) for (int na : nauoOf[pd]) { gp_Trsf t = nauoTrsf[na]; walkPd(nauoChild[na], w * t); } };
    for (int pd : pds) if (!isChild.count(pd)) walkPd(pd, gp_Trsf());
    STEPControl_Reader ref; if (ref.ReadFile(in.c_str()) != IFSelect_RetDone) fehler("Referenz konnte nicht gelesen werden");
    ref.TransferRoots(); TopoDS_Shape g = ref.OneShape(); std::vector<TopoDS_Shape> gs; allSolids(g, gs);
    for (auto& x : gs) { Bnd_Box b; BRepBndLib::Add(x, b, false); double x0, y0, z0, x1, y1, z1; b.Get(x0, y0, z0, x1, y1, z1); B.push_back({x0, y0, z0, x1, y1, z1}); }
    std::sort(A.begin(), A.end()); std::sort(B.begin(), B.end()); double tol = diag * 1e-5; int diff = 0;
    if (A.size() != B.size()) diff = -1; else for (size_t k = 0; k < A.size(); k++) for (int z = 0; z < 6; z++) if (fabs(A[k][z] - B[k][z]) > tol) { diff++; break; }
    fprintf(stderr, "PRUEFEN instanzen nativ=%zu referenz=%zu abweichend=%d\n", A.size(), B.size(), diff);
    fflush(stderr); std::_Exit(diff == 0 ? 0 : 3);
  }
  fprintf(stderr, "OK modus=%s unikate=%zu items=%zu threads=%d fehler=%d zeit=%ldms speicher=%ldMB\n", unbekannt ? "seriell" : "parallel", U.size(), items.size(), T, fehlerZahl.load(), ms(), hwmMB());
  for (auto& kv : times) fprintf(stderr, "  %s: %ld\n", kv.first.c_str(), kv.second);
  fflush(stderr); std::_Exit(0); // Abbau der OCCT-Objekte überspringen (spart Sekunden bei großen Modellen)
}
