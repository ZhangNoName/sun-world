// Shared test-host framing only. Configuration and JSON validation remain in
// stack-worker.mjs / the existing RPC parser; no CLI bypass or parser copy.
const invalid = () => new Error('AGENT_STACK_FIXTURE_FAILED')

// Bounds bytes before concatenation and permits one config plus one command.
// The caller owns the Readable and supplies its own failure/shutdown callback.
export function inputLines(stream, onFailure) {
  let pending = Buffer.alloc(0),
    count = 0,
    ended = false,
    failure,
    waiter
  const queue = []
  const deliver = () => {
    if (!waiter) return
    const current = waiter
    if (failure) {
      waiter = undefined
      current.reject(invalid())
    } else if (queue.length) {
      waiter = undefined
      current.resolve(queue.shift())
    } else if (ended) {
      waiter = undefined
      current.resolve(null)
    }
  }
  const fail = () => {
    failure = true
    deliver()
    onFailure()
  }
  const data = (chunk) => {
    if (failure) return
    try {
      let offset = 0
      while (offset < chunk.length) {
        const newline = chunk.indexOf(10, offset)
        const end = newline < 0 ? chunk.length : newline
        if (count >= 2 || pending.length + end - offset > (count ? 128 : 16384))
          throw invalid()
        pending = Buffer.concat([pending, chunk.subarray(offset, end)])
        if (newline < 0) break
        queue.push(pending)
        count++
        pending = Buffer.alloc(0)
        offset = end + 1
        deliver()
      }
    } catch {
      fail()
    }
  }
  const end = () => {
    if (pending.length) return fail()
    ended = true
    deliver()
  }
  stream.on('data', data).on('end', end).on('error', fail)
  return {
    next: () =>
      new Promise((resolve, reject) => {
        waiter = { resolve, reject }
        deliver()
      }),
    check: () => {
      if (failure) throw invalid()
    },
    dispose: () => {
      ended = true
      deliver()
      stream.off('data', data).off('end', end).off('error', fail).pause()
    },
  }
}
