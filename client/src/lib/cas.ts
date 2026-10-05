// Reads a CAS statement PDF on the user's device with pdf.js. Loaded only by the import page
// (dynamic import → its own chunk). The file and its password never leave the browser: the
// password is passed to pdf.js for the unlock call only and isn't stored anywhere.
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { groupLines, parseCas, type CasResult, type TextItem } from "./casParse";

// Served from our own origin, so the strict 'self' Content-Security-Policy is unchanged.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export class CasPasswordError extends Error {
  constructor(public readonly incorrect: boolean) {
    super(incorrect ? "That password didn't open the statement." : "This statement is password-protected.");
    this.name = "CasPasswordError";
  }
}

const MAX_PAGES = 60;

export async function readCas(file: File, password?: string): Promise<CasResult & { pages: number }> {
  const data = new Uint8Array(await file.arrayBuffer());
  // No WebAssembly (the CSP doesn't allow it, and text extraction doesn't need it).
  const task = pdfjs.getDocument({ data, password, useWasm: false, verbosity: 0, stopAtErrors: false });
  let doc: pdfjs.PDFDocumentProxy;
  try {
    doc = await task.promise;
  } catch (error) {
    await task.destroy();
    if (error && typeof error === "object" && (error as { name?: string }).name === "PasswordException") {
      throw new CasPasswordError((error as { code?: number }).code === 2);
    }
    throw new Error("This file couldn't be read as a PDF.");
  }
  try {
    const items: TextItem[] = [];
    const pages = Math.min(doc.numPages, MAX_PAGES);
    for (let number = 1; number <= pages; number++) {
      const content = await (await doc.getPage(number)).getTextContent();
      for (const item of content.items) {
        if ("str" in item && item.transform) items.push({ str: item.str, x: item.transform[4], y: item.transform[5] - number * 10_000 });
      }
    }
    return { ...parseCas(groupLines(items)), pages };
  } finally {
    await task.destroy();
  }
}
