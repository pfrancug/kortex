import type {
  ParseRequest,
  ParseResult,
  ParseError,
  WorkerResponse,
} from './GraphParseWorker';

/**
 * Parse graph data in a Web Worker and return TypedArrays
 * transferred back via zero-copy Transferable handoff.
 *
 * Usage:
 * ```ts
 * const result = await parseGraphAsync('json', jsonString);
 * store.setNodes(result.positions, undefined, undefined, result.labels);
 * store.setEdges(result.edgeIndices);
 * if (result.layoutSuggested) startForceLayout(result);
 * ```
 *
 * Optional `workerUrl`; default is `./GraphParseWorker.js` beside this module (`dist/` on npm).
 */
export function parseGraphAsync(
  type: ParseRequest['type'],
  data: string,
  workerUrl?: URL,
): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const url = workerUrl ?? new URL('./GraphParseWorker.js', import.meta.url);

    const worker = new Worker(url, { type: 'module' });

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      worker.terminate();
      if ('error' in e.data) {
        reject(new Error((e.data as ParseError).error));
      } else {
        resolve(e.data as ParseResult);
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    const msg: ParseRequest = { type, data };
    worker.postMessage(msg);
  });
}
