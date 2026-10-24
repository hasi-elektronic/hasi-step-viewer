import assert from 'node:assert/strict';
import {createTapGuard} from '../src/pointer-gesture.js';
const el=new EventTarget(),guard=createTapGuard(el);
const send=(type,id,x=20,y=20)=>{const e=new Event(type);Object.assign(e,{pointerId:id,clientX:x,clientY:y,button:0,pointerType:'touch'});el.dispatchEvent(e);return e};
send('pointerdown',1);assert(guard.wasTap(send('pointerup',1)));
for(const order of [[1,2],[2,1]]){
  send('pointerdown',1);send('pointerdown',2,40);assert(guard.isMultiple());
  assert(!guard.wasTap(send('pointerup',order[0])));assert(!guard.wasTap(send('pointerup',order[1])));assert.equal(guard.count(),0);
}
send('pointerdown',1);send('pointermove',1,80);send('pointermove',1,20);assert(!guard.wasTap(send('pointerup',1)),'Zurückgezogener Drag bleibt ein Drag');
send('pointerdown',1);assert(!guard.wasTap(send('pointercancel',1)));assert.equal(guard.count(),0);
send('pointerdown',2);assert(guard.wasTap(send('pointerup',2)),'Nach Abbruch sind neue Taps möglich');
guard.dispose();console.log('OK: Tap, Mehrfinger-Endreihenfolge, Drag-Rückkehr und pointercancel');
