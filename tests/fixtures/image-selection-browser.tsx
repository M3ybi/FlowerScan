import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { ImageSourcePicker } from "../../src/components/ImageSourcePicker";
import { useImageSelection } from "../../src/hooks/useImageSelection";
import { captureImage } from "../../src/lib/imageCaptureService";

export const runImageSelectionChecks = async (assert: (value: unknown, message: string) => void, jpeg: Blob) => {
  const host = document.createElement("div"); document.body.appendChild(host);
  let root = createRoot(host);
  let state: ReturnType<typeof useImageSelection>;
  let mode: "safe" | "reject" | "hold" = "safe";
  const held: Array<() => void> = [];
  const statuses: string[] = [];
  const created: string[] = [], revoked = new Set<string>();
  const nativeSources: string[] = [];
  let cancelNative = false;
  let denyNative = false;
  const originalFetch = globalThis.fetch, originalPlatform = Capacitor.getPlatform;
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (blob) => { const url = originalCreate(blob); created.push(url); return url; };
  URL.revokeObjectURL = (url) => { revoked.add(url); originalRevoke(url); };
  const safe = { containsPlant:true,plantConfidence:1,hasSensitiveBackground:false,hasExplicitOrUnsafeContent:false,
    hasRestrictedFootageOrPrivateContent:false,shouldAllowUpload:true,failureReasons:[],safeUserMessage:"Allowed" };
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith("data:")) return originalFetch(input, init);
    if (mode === "hold") await new Promise<void>((resolve) => held.push(resolve));
    return mode === "reject" ? Response.json({code:"IMAGE_SERVICE_UNAVAILABLE"},{status:503}) : Response.json({validation:safe});
  };
  const dataUrl = await new Promise<string>((resolve) => {const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.readAsDataURL(jpeg);});
  const boundary = globalThis as typeof globalThis & { __imageNativeBoundary?: (options:{source:string})=>Promise<{webPath:string}> };
  boundary.__imageNativeBoundary = async (options) => {
    nativeSources.push(options.source);
    if (cancelNative) throw new Error("User cancelled photos app");
    if (denyNative) throw new Error("Camera permission denied");
    return {webPath:dataUrl};
  };
  const Harness = ({enabled,scope}:{enabled:boolean;scope:string}) => {
    const [name,setName] = useState("My plant");
    const [status,setStatus] = useState("");
    state=useImageSelection({enabled,scopeKey:scope,language:"sk",onStatus:(message)=>{statuses.push(message);setStatus(message);},
      copy:{processing:"processing",validating:"validating",ready:"ready"}});
    return <><input aria-label="plant name" value={name} onChange={event=>setName(event.currentTarget.value)} />
      {enabled ? <ImageSourcePicker title="Add photo" help="JPEG, PNG, WebP / 15 MB" cameraLabel="Take photo" galleryLabel="Gallery"
        busy={state.isProcessing} onSelect={state.select} onCancel={state.cancel} /> : null}
      <p data-status>{status}</p>{state.image ? <img src={state.image.previewUrl} alt="preview"/> : null}</>;
  };
  const render = (enabled=true,scope="home-a") => flushSync(()=>root.render(<Harness enabled={enabled} scope={scope}/>));
  const wait = async (condition:()=>unknown) => {
    for(let attempt=0;attempt<400;attempt++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,5));}
    throw new Error("Image selection did not settle");
  };
  const choose = (source:"camera"|"gallery") => {
    flushSync(()=>host.querySelector<HTMLButtonElement>(".image-upload")!.click());
    const buttons=host.querySelectorAll<HTMLButtonElement>(".image-capture-actions button");
    assert(buttons.length===2,"shared picker offers camera and gallery");
    flushSync(()=>buttons[source==="camera"?0:1].click());
  };
  const webFile = (source:"camera"|"gallery",file:File) => {
    const input=host.querySelector<HTMLInputElement>(`input[type=file]${source==="camera"?"[capture]":":not([capture])"}`)!;
    input.addEventListener("click",event=>event.preventDefault(),{once:true});
    choose(source);
    const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;
    flushSync(()=>input.dispatchEvent(new Event("change",{bubbles:true})));
    return input;
  };
  try {
    Capacitor.getPlatform=()=>"web";
    render();
    for(const source of ["gallery","gallery","camera","gallery","camera"] as const){
      const previous=state!.image;
      const input=webFile(source,new File([jpeg],`${source}.jpg`,{type:"image/jpeg"}));
      await wait(()=>!state!.isProcessing&&state!.image!==previous);
      assert(state!.image?.mimeType==="image/jpeg"&&input.value==="",`consecutive web ${source} selection creates a fresh ready JPEG`);
      if(previous)assert(revoked.has(previous.previewUrl),"replacing a selection releases the previous preview");
    }
    const previous=state!.image;
    const empty=host.querySelector<HTMLInputElement>('input[type=file]:not([capture])')!;
    const count=statuses.length;
    flushSync(()=>empty.dispatchEvent(new Event("change",{bubbles:true})));
    assert(state!.image===previous&&statuses.length===count,"cancelled web selection keeps the previous photo and status");
    mode="reject";
    webFile("gallery",new File([jpeg],"rejected.jpg",{type:"image/jpeg"}));
    await wait(()=>!state!.isProcessing);
    assert(state!.image===previous&&host.querySelector("[data-status]")!.textContent!.includes("dočasne"),"validation failure preserves the form/photo and shows a localized error");
    assert(host.querySelector<HTMLInputElement>('input[aria-label="plant name"]')!.value==="My plant","photo failure preserves the entered plant name");
    mode="safe";
    webFile("gallery",new File([jpeg],"retry.jpg",{type:"image/jpeg"}));
    await wait(()=>!state!.isProcessing&&state!.image!==previous);
    assert(state!.image?.name==="retry.jpg","selection retries after a failure without a stale lock");
    flushSync(()=>state!.clear());
    render(false);await wait(()=>!state!.isProcessing);render(true);
    webFile("gallery",new File([jpeg],"second-plant.jpg",{type:"image/jpeg"}));
    await wait(()=>!state!.isProcessing&&!!state!.image);
    assert(state!.image?.name==="second-plant.jpg","clearing after success and reopening accepts the next plant photo");

    mode="hold";
    const first=state!.select("gallery",new File([jpeg],"first-request.jpg",{type:"image/jpeg"}));
    await state!.select("gallery",new File([jpeg],"duplicate-request.jpg",{type:"image/jpeg"}));
    await wait(()=>held.length===1);held.shift()!();await first;
    await wait(()=>!state!.isProcessing);
    assert(state!.image?.name==="first-request.jpg","duplicate synchronous selections start only one image operation");

    mode="hold";
    webFile("gallery",new File([jpeg],"old-modal.jpg",{type:"image/jpeg"}));
    await wait(()=>held.length===1);
    render(false);await wait(()=>!state!.isProcessing);render(true);
    webFile("camera",new File([jpeg],"new-modal.jpg",{type:"image/jpeg"}));
    await wait(()=>held.length===2);
    held.shift()!();
    await new Promise(resolve=>setTimeout(resolve,0));
    assert(state!.isProcessing,"old modal completion cannot release a newer capture lock");
    held.shift()!();
    await wait(()=>!state!.isProcessing&&state!.image?.name==="new-modal.jpg");
    assert(true,"closing/reopening ignores the old image result");

    webFile("gallery",new File([jpeg],"old-household.jpg",{type:"image/jpeg"}));
    await wait(()=>held.length===1);
    render(true,"home-b");mode="safe";held.shift()!();
    await wait(()=>!state!.isProcessing);
    assert(state!.image===null,"household switch releases the prior photo and ignores in-flight results");
    webFile("gallery",new File([jpeg],"new-household.jpg",{type:"image/jpeg"}));
    await wait(()=>!state!.isProcessing&&!!state!.image);
    assert(state!.image?.name==="new-household.jpg","new household accepts fresh selections");

    Capacitor.getPlatform=()=>"android";
    for(const source of ["gallery","gallery","camera","camera","gallery"] as const){
      const before=state!.image;
      choose(source);await wait(()=>!state!.isProcessing&&state!.image!==before);
      assert(nativeSources.at(-1)===(source==="camera"?"CAMERA":"PHOTOS"),`Android ${source} uses the Capacitor camera boundary`);
    }
    cancelNative=true;const beforeCancel=state!.image;choose("gallery");await wait(()=>!state!.isProcessing);
    assert(state!.image===beforeCancel,"native cancellation preserves the selected image");
    assert(statuses.at(-1)==="ready","native cancellation restores the previous ready status");cancelNative=false;
    denyNative=true;choose("camera");await wait(()=>!state!.isProcessing);
    assert(state!.image===beforeCancel&&statuses.at(-1)!.includes("povoľ"),"denied native camera permission shows a specific localized error and preserves the photo");denyNative=false;
    const previousBoundary=boundary.__imageNativeBoundary!;
    let releasePicker:(()=>void)|undefined,pickerCalls=0;
    try {
      boundary.__imageNativeBoundary=async()=>{
        pickerCalls++;
        if(pickerCalls===1)await new Promise<void>(resolve=>{releasePicker=resolve;});
        return {webPath:dataUrl};
      };
      const oldController=new AbortController();
      const oldPicker=captureImage({source:"gallery",signal:oldController.signal}).catch(error=>error);
      await wait(()=>releasePicker);oldController.abort();
      const newPicker=captureImage({source:"camera"});
      await new Promise(resolve=>setTimeout(resolve,0));
      assert(pickerCalls===1,"closing/reopening cannot launch overlapping native OS pickers");
      releasePicker!();
      assert((await oldPicker).name==="AbortError","cancelled native picker result is discarded before reading it");
      const fresh=await newPicker;
      assert(pickerCalls===2&&fresh.source==="camera","queued native selection starts fresh after the old picker closes");
      URL.revokeObjectURL(fresh.previewUrl);
    } finally {boundary.__imageNativeBoundary=previousBoundary;}

    Capacitor.getPlatform=()=>"web";mode="hold";
    webFile("gallery",new File([jpeg],"unmounted.jpg",{type:"image/jpeg"}));await wait(()=>held.length===1);
    const beforeUnmount=statuses.length;
    flushSync(()=>root.unmount());held.shift()!();await new Promise(resolve=>setTimeout(resolve,0));
    assert(statuses.length===beforeUnmount,"unmounted image work cannot update status or React state");
    assert(created.every(url=>revoked.has(url)),"all selected, replaced and stale preview URLs are released");
    root=createRoot(host);render();mode="safe";
    const createBitmap=globalThis.createImageBitmap;
    let releaseDecode:(()=>void)|undefined,closed=0;
    try {
      Object.defineProperty(globalThis,"createImageBitmap",{configurable:true,writable:true,value:(source:ImageBitmapSource,options?:ImageBitmapOptions)=>new Promise<ImageBitmap>((resolve,reject)=>{
        releaseDecode=()=>{void createBitmap(source,options).then(bitmap=>{
          const close=bitmap.close.bind(bitmap);bitmap.close=()=>{closed++;close();};resolve(bitmap);
        },reject);};
      })});
      webFile("gallery",new File([jpeg],"unmount-decode.jpg",{type:"image/jpeg"}));await wait(()=>releaseDecode);
      const statusBeforeDecodeUnmount=statuses.length;flushSync(()=>root.unmount());releaseDecode!();await wait(()=>closed===1);
      assert(statuses.length===statusBeforeDecodeUnmount,"unmount during decoding closes the bitmap without updating React state");
    } finally { globalThis.createImageBitmap=createBitmap; }
  } finally {
    for(const release of held)release();
    flushSync(()=>root.unmount());host.remove();
    globalThis.fetch=originalFetch;Capacitor.getPlatform=originalPlatform;
    URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;delete boundary.__imageNativeBoundary;
  }
};

export const renderImagePickerPreview = (assert: (value: unknown, message: string) => void) => {
  const host=document.createElement("div");document.body.appendChild(host);
  const root=createRoot(host);
  flushSync(()=>root.render(<div className="modal-backdrop"><section className="plant-modal">
    <div className="section-title"><h2>Pridať novú rastlinu</h2></div>
    <div className="field"><span>Názov rastliny</span><input value="Monstera" readOnly/></div>
    <div className="field"><span>Obrázok rastliny</span>
      <ImageSourcePicker title="Vybrať fotku" help="JPG, PNG, WEBP max 15 MB" cameraLabel="Odfotiť" galleryLabel="Galéria"
        onSelect={async()=>{}} onCancel={()=>{}}/>
    </div>
  </section></div>));
  flushSync(()=>host.querySelector<HTMLButtonElement>(".image-upload")!.click());
  const modal=host.querySelector<HTMLElement>(".plant-modal")!;
  assert(modal.scrollWidth<=modal.clientWidth,"shared picker fits the mobile modal without horizontal overflow");
  assert(host.querySelectorAll(".image-capture-actions button").length===2,"mobile picker presents both localized source choices");
};
