import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { ImageSourcePicker } from "../../src/components/ImageSourcePicker";
import { useImageSelection } from "../../src/hooks/useImageSelection";
import { captureImage } from "../../src/lib/imageCaptureService";
import { PlantActionModal, PlantFormStatus, PlantImagePreview } from "../../src/components/PlantActionModal";
import { LoadingButton } from "../../src/components/LoadingButton";
import { createTranslator } from "../../src/lib/i18n";
import { ImageUploadError, logImageProcessingFailure } from "../../src/lib/imageUploadErrors";

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
        cancelLabel="Cancel" busy={state.isProcessing} onSelect={state.select} onCancel={state.cancel} /> : null}
      <p data-status>{status}</p>{state.image ? <img src={state.image.previewUrl} alt="preview"/> : null}</>;
  };
  const render = (enabled=true,scope="home-a") => flushSync(()=>root.render(<Harness enabled={enabled} scope={scope}/>));
  const wait = async (condition:()=>unknown) => {
    for(let attempt=0;attempt<400;attempt++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,5));}
    throw new Error("Image selection did not settle");
  };
  const choose = (_source:"camera"|"gallery") => {
    flushSync(()=>host.querySelector<HTMLButtonElement>(".image-upload")!.click());
    assert(host.querySelectorAll("input[type=file]").length===1&&host.querySelectorAll(".image-capture-actions").length===0,
      "shared picker opens one platform chooser without custom source buttons");
  };
  const webFile = (source:"camera"|"gallery",file:File) => {
    const input=host.querySelector<HTMLInputElement>('input[type=file]')!;
    input.addEventListener("click",event=>event.preventDefault(),{once:true});
    choose(source);
    const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;
    flushSync(()=>input.dispatchEvent(new Event("change",{bubbles:true})));
    assert(!input.disabled,"provider input stays enabled while the photo is read");
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
    const originalStream=File.prototype.stream, debug=console.debug;
    const logs: unknown[][]=[];
    const beforeReadFailure=state!.image;
    try {
      console.debug=(...args)=>{logs.push(args);};
      File.prototype.stream=function(){throw new DOMException("private-provider-url-and-token", "NotReadableError");};
      webFile("gallery",new File([jpeg],"private-photo-name.jpg",{type:"image/jpeg"}));
      await wait(()=>!state!.isProcessing);
      assert(state!.image===beforeReadFailure&&statuses.at(-1)!.includes("Stiahni"),"provider read failure preserves the prior photo and shows the localized read error");
      assert(logs.some(entry=>{
        const details=entry[1] as Record<string,unknown>;
        return details.stage==="file-read"&&details.name==="NotReadableError"&&details.runtime==="web"&&details.inputMime==="image/jpeg"&&details.originalBytes===jpeg.size;
      }),"development diagnostic identifies the actual read stage, runtime, MIME, size and safe browser error name");
      logImageProcessingFailure("input-check",new ImageUploadError("INVALID_IMAGE"),{runtime:"web",inputMime:"private-mime-value",originalBytes:NaN});
      assert(!JSON.stringify(logs).includes("private-")&&!JSON.stringify(logs).includes("data:image"),"image diagnostics exclude provider messages, filenames, unexpected MIME strings and image contents");
    } finally {File.prototype.stream=originalStream;console.debug=debug;}
    webFile("gallery",new File([jpeg],"after-read-failure.jpg",{type:"image/jpeg"}));
    await wait(()=>!state!.isProcessing&&state!.image!==beforeReadFailure);
    assert(state!.image?.name==="after-read-failure.jpg","the next photo succeeds immediately after a provider read failure");
    const originalBlob=globalThis.Blob;
    const beforeAllocationFailure=state!.image;
    try {
      globalThis.Blob=new Proxy(originalBlob,{construct(){throw new RangeError("Allocation failed");}});
      webFile("gallery",new File([jpeg],"allocation.jpg",{type:"image/jpeg"}));
      await wait(()=>!state!.isProcessing);
      assert(state!.image===beforeAllocationFailure&&statuses.at(-1)!.includes("spracovať")&&!statuses.at(-1)!.includes("Stiahni"),
        "an unexpected snapshot allocation failure is a processing error rather than a misleading gallery-read error");
    } finally {globalThis.Blob=originalBlob;}
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
      assert(nativeSources.at(-1)==="PROMPT",`Android ${source} choice uses Capacitor's native camera/gallery prompt`);
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
  const opener=document.createElement("button");opener.textContent="Open";document.body.appendChild(opener);opener.focus();
  const previousOverflow=document.body.style.overflow;
  let closes=0;
  const preview=document.createElement("canvas");preview.width=40;preview.height=20;
  preview.getContext("2d")!.fillRect(0,0,40,20);
  const previewUrl=preview.toDataURL("image/jpeg");
  const render=(workflow:"add"|"diagnosis",language:"en"|"sk",busy=false,withPreview=false)=>{
    const t=createTranslator(language);
    const picker=<ImageSourcePicker title={t(workflow==="add"?"plantForm.choosePhoto":"diagnosis.photoPrompt")}
      help={t("plantForm.photoHelp")} cameraLabel={t("action.camera")} galleryLabel={t("action.gallery")} cancelLabel={t("action.cancel")}
      onSelect={async()=>{}} onCancel={()=>{}}/>;
    flushSync(()=>root.render(<PlantActionModal id="fixture" title={t(workflow==="add"?"plantForm.title":"detail.diagnosisAction")}
      description={t(workflow==="add"?"plantForm.body":"diagnosis.modalBody")} icon={null} closeLabel={t("action.close")}
      busy={busy} onClose={()=>{closes++;}}>
      {workflow==="add"?<form className="add-plant-form modal-form" onSubmit={event=>event.preventDefault()}>
        <label className="field"><span>{t("plantForm.name")}</span><input value="Monstera" readOnly/></label>
        <div className="field"><span>{t("plantForm.image")}</span>{picker}
          {withPreview?<PlantImagePreview src={previewUrl} alt={t("plantForm.previewAlt")}/>:null}</div>
        <LoadingButton className="primary-action" type="submit">{t("dashboard.addPlant")}</LoadingButton>
      </form>:<><label className="field"><span>{t("diagnosis.symptoms")}</span><textarea rows={3}/></label>{picker}
        {withPreview?<PlantImagePreview src={previewUrl} alt={t("diagnosis.previewAlt")}/>:null}
        <LoadingButton className="primary-action diagnosis-run-button">{t("diagnosis.analyzing")}</LoadingButton></>}
      <PlantFormStatus>{withPreview?t("plantForm.photoReady"):""}</PlantFormStatus>
    </PlantActionModal>));
  };
  let pickerStyle="";
  for(const workflow of ["add","diagnosis"] as const)for(const language of ["en","sk"] as const){
    render(workflow,language,false,true);
    const modal=host.querySelector<HTMLElement>(".plant-action-modal")!;
    const photo=host.querySelector<HTMLButtonElement>(".image-upload")!;
    const primary=host.querySelector<HTMLButtonElement>(".primary-action")!;
    const style=getComputedStyle(photo);
    assert(style.display==="grid"&&style.borderStyle==="dashed"&&style.backgroundImage!==getComputedStyle(primary).backgroundImage,
      `${workflow}/${language} photo control keeps the diagnosis picker styling inside its real workflow`);
    const signature=JSON.stringify([style.backgroundImage,style.padding,style.borderRadius,style.height]);
    if(pickerStyle)assert(signature===pickerStyle,`${workflow}/${language} photo picker matches the shared baseline`);
    pickerStyle=signature;
    assert(modal.scrollWidth<=modal.clientWidth&&document.documentElement.scrollWidth<=window.innerWidth,
      `${workflow}/${language} modal fits mobile without horizontal overflow`);
    const bounds=modal.getBoundingClientRect();
    assert(bounds.top>=0&&bounds.bottom<=window.innerHeight,`${workflow}/${language} modal remains inside the viewport`);
    assert(document.body.style.overflow==="hidden","opening a plant modal locks background scrolling");
    assert(host.querySelectorAll(".image-upload").length===1&&host.querySelectorAll(".image-capture-actions").length===0,
      `${workflow}/${language} has one photo control without a nested source menu`);
    assert(host.querySelector('[role="status"]')?.textContent===createTranslator(language)("plantForm.photoReady"),
      `${workflow}/${language} status is localized and announced`);
    assert(host.querySelector<HTMLButtonElement>(".modal-close")!.getBoundingClientRect().width>=44,"modal close target is at least 44px");
    const image=host.querySelector<HTMLElement>(".plant-image-preview")!.getBoundingClientRect();
    assert(Math.abs(image.width/image.height-4/3)<0.01&&getComputedStyle(host.querySelector<HTMLElement>(".plant-image-preview")!).objectFit==="contain",
      `${workflow}/${language} preview has the same uncropped 4:3 frame`);
    primary.focus();document.dispatchEvent(new KeyboardEvent("keydown",{key:"Tab",bubbles:true,cancelable:true}));
    assert(document.activeElement===host.querySelector(".modal-close"),"Tab wraps focus within the shared modal");
  }
  render("add","sk",true);
  document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
  assert(closes===0&&host.querySelector<HTMLButtonElement>(".modal-close")!.disabled,"saving prevents accidental modal dismissal");
  render("add","sk");
  document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
  host.querySelector<HTMLButtonElement>(".modal-close")!.click();
  assert(closes===2,"Escape and the shared close button request dismissal when idle");
  const viewport=window.visualViewport!;
  const originalHeight=Object.getOwnPropertyDescriptor(viewport,"height");
  try {
    render("add","sk",false,true);
    Object.defineProperty(viewport,"height",{configurable:true,value:360});viewport.dispatchEvent(new Event("resize"));
    const backdrop=host.querySelector<HTMLElement>(".plant-action-backdrop")!;
    const modal=host.querySelector<HTMLElement>(".plant-action-modal")!;
    assert(backdrop.style.height==="360px"&&modal.getBoundingClientRect().height<=332,"keyboard-sized visual viewport bounds the modal and leaves its content scrollable");
    modal.scrollTop=modal.scrollHeight;
    const action=host.querySelector<HTMLElement>(".primary-action")!.getBoundingClientRect();
    assert(action.top>=modal.getBoundingClientRect().top&&action.bottom<=modal.getBoundingClientRect().bottom,
      "primary action can be reached by scrolling while the keyboard-sized viewport is open");
  } finally {
    if(originalHeight)Object.defineProperty(viewport,"height",originalHeight);else Reflect.deleteProperty(viewport,"height");
    viewport.dispatchEvent(new Event("resize"));
  }
  flushSync(()=>root.render(null));
  assert(document.body.style.overflow===previousOverflow&&document.activeElement===opener,"closing restores background scrolling and opener focus");
  render("add","sk");
  assert(document.body.style.overflow==="hidden","reopening installs fresh modal interactions");
  opener.remove();
};
