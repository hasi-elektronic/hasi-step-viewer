# Erzeugt das Testblech (Z-Profil, s=2, ri=3, Bohrung Ø10) als STEP mit Einheit ZENTIMETER.
# Dient zum Test der mm-Umrechnung. Werkzeug: CadQuery/OCP (Apache-2.0, nur Entwicklung).
# Aufruf: python tools/make-testblech-cm.py public/testblech.step testdaten/testblech-cm.step
import sys
from OCP.STEPControl import STEPControl_Reader, STEPControl_Writer, STEPControl_AsIs
from OCP.Interface import Interface_Static
src, out = sys.argv[1], sys.argv[2]
r = STEPControl_Reader(); r.ReadFile(src); r.TransferRoots(); shape = r.OneShape()  # intern mm
Interface_Static.SetCVal_s('write.step.unit', 'CM')
Interface_Static.SetCVal_s('write.step.product.name', 'Testblech Z-Profil (cm)')
w = STEPControl_Writer(); w.Transfer(shape, STEPControl_AsIs); w.Write(out)
print('geschrieben', out)
