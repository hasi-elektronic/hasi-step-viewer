// Erzeugt testdaten/farbbaugruppe.step (synthetisch, keine Kundendaten): Platte rot mit grüner Oberseite, Bolzen gelb, zweiter Bolzen als Instanzfarbe blau.
// Bauen: g++ -std=c++17 tools/farbbaugruppe-erzeugen.cpp -I<occt>/include/opencascade -L<occt>/lib -lTKDESTEP -lTKDE -lTKXCAF -lTKLCAF -lTKCAF -lTKCDF -lTKXSBase -lTKPrim -lTKTopAlgo -lTKBRep -lTKG3d -lTKGeomBase -lTKMath -lTKernel
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TDocStd_Document.hxx>
#include <XCAFApp_Application.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <XCAFDoc_ColorTool.hxx>
#include <TDataStd_Name.hxx>
#include <STEPCAFControl_Writer.hxx>
#include <STEPCAFControl_Controller.hxx>
#include <Interface_Static.hxx>
#include <gp_Trsf.hxx>
#include <TopLoc_Location.hxx>
#include <Quantity_Color.hxx>
#include <cstdio>
int main(int argc, char** argv) {
  STEPCAFControl_Controller::Init();
  Handle(XCAFApp_Application) app = XCAFApp_Application::GetApplication(); Handle(TDocStd_Document) doc; app->NewDocument("MDTV-XCAF", doc);
  auto st = XCAFDoc_DocumentTool::ShapeTool(doc->Main()); auto ct = XCAFDoc_DocumentTool::ColorTool(doc->Main());
  Quantity_Color rot(0.8, 0.1, 0.1, Quantity_TOC_sRGB), gruen(0.1, 0.7, 0.2, Quantity_TOC_sRGB), blau(0.1, 0.2, 0.8, Quantity_TOC_sRGB), gelb(0.9, 0.8, 0.1, Quantity_TOC_sRGB);
  TopoDS_Shape platte = BRepPrimAPI_MakeBox(100, 60, 10).Shape(), bolzen = BRepPrimAPI_MakeCylinder(8, 40).Shape();
  TDF_Label lp = st->AddShape(platte, false); TDataStd_Name::Set(lp, "Platte");
  TDF_Label lb = st->AddShape(bolzen, false); TDataStd_Name::Set(lb, "Bolzen");
  ct->SetColor(lp, rot, XCAFDoc_ColorSurf);                       // Teilfarbe
  TopExp_Explorer e(platte, TopAbs_FACE); for (int k = 0; k < 5; k++) e.Next(); // Oberseite (z = 10)
  TDF_Label lf = st->AddSubShape(lp, e.Current()); ct->SetColor(lf, gruen, XCAFDoc_ColorSurf); // Flächenfarbe
  ct->SetColor(lb, gelb, XCAFDoc_ColorSurf);
  TDF_Label asm_ = st->NewShape(); TDataStd_Name::Set(asm_, "Farbbaugruppe");
  auto lage = [](double x, double y, double z) { gp_Trsf t; t.SetTranslation(gp_Vec(x, y, z)); return TopLoc_Location(t); };
  st->AddComponent(asm_, lp, lage(0, 0, 0));
  st->AddComponent(asm_, lb, lage(20, 30, 10));
  TDF_Label k2 = st->AddComponent(asm_, lb, lage(80, 30, 10));
  ct->SetColor(k2, blau, XCAFDoc_ColorSurf);                      // Instanzfarbe: zweiter Bolzen blau
  st->UpdateAssemblies();
  Interface_Static::SetCVal("write.step.schema", "AP214IS"); Interface_Static::SetCVal("write.step.unit", "MM");
  STEPCAFControl_Writer w; w.SetColorMode(true); w.SetNameMode(true);
  if (!w.Transfer(doc, STEPControl_AsIs) || w.Write(argc > 1 ? argv[1] : "farbig-baugruppe.stp") != IFSelect_RetDone) { fprintf(stderr, "Fehler\n"); return 1; }
  return 0;
}
