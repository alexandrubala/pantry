export type MemoryR2Object = {
  bytes: Uint8Array
  contentType: string
}

export type MemoryR2 = R2Bucket & {
  objects: Map<string, MemoryR2Object>
}

async function toBytes(
  value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob,
): Promise<Uint8Array> {
  if (value == null) {
    return new Uint8Array()
  }

  if (typeof value === 'string') {
    return new TextEncoder().encode(value)
  }

  if (value instanceof Uint8Array) {
    return value
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value)
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return new Uint8Array(await value.arrayBuffer())
  }

  throw new Error('unsupported R2 value')
}

export function memoryR2(): MemoryR2 {
  const objects = new Map<string, MemoryR2Object>()

  return {
    objects,
    async put(key, value, options) {
      const bytes = await toBytes(value)
      const contentType =
        options && 'httpMetadata' in options && options.httpMetadata && 'contentType' in options.httpMetadata
          ? (options.httpMetadata.contentType ?? 'application/octet-stream')
          : 'application/octet-stream'
      objects.set(key, { bytes, contentType })
      return { key, size: bytes.byteLength } as R2Object
    },
    async get(key) {
      const stored = objects.get(key)
      if (!stored) {
        return null
      }

      const copy = stored.bytes.slice()
      return {
        body: copy,
        httpMetadata: { contentType: stored.contentType },
        arrayBuffer: async () => copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength),
      } as R2ObjectBody
    },
    async delete(key) {
      for (const item of Array.isArray(key) ? key : [key]) {
        objects.delete(item)
      }
    },
  } as MemoryR2
}
