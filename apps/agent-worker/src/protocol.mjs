export function messageFrames(message) {
  const frames = [
    { type: 'message_start', message: { ...message, content: [] } },
  ]
  for (const [index, block] of message.content.entries()) {
    const tool = block.type === 'tool_use'
    frames.push({
      type: 'content_block_start',
      index,
      content_block: tool
        ? { ...block, input: {} }
        : { type: 'text', text: '' },
    })
    const value = tool ? JSON.stringify(block.input) : block.text
    // Keep incremental parameters in the local adapter contract too.
    const middle = Math.floor(value.length / 2)
    for (const part of [value.slice(0, middle), value.slice(middle)])
      frames.push({
        type: 'content_block_delta',
        index,
        delta: tool
          ? { type: 'input_json_delta', partial_json: part }
          : { type: 'text_delta', text: part },
      })
    frames.push({ type: 'content_block_stop', index })
  }
  frames.push({
    type: 'message_delta',
    delta: { stop_reason: message.stop_reason },
    usage: message.usage,
  })
  frames.push({ type: 'message_stop' })
  return frames
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('')
}

export function projectRootAnswer(events) {
  const starts = events.filter((event) => event.type === 'turn/start')
  const ends = events.filter((event) => event.type === 'turn/end')
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    starts[0].data.turn !== ends[0].data.turn ||
    ends[0].data.reason.kind !== 'completed'
  ) {
    throw new Error('Incomplete root turn')
  }
  const turn = starts[0].data.turn
  const messages = events.filter(
    (event) => event.type === 'assistant/message' && event.data.turn === turn
  )
  const final = messages.at(-1)
  if (
    !final ||
    final.data.interrupted ||
    final.data.message.content.some(
      (block) => block.type !== 'text' && block.type !== 'thinking'
    )
  )
    throw new Error('Missing final answer')
  const text = final.data.message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
  const result = JSON.parse(text)
  if (
    typeof result.answer !== 'string' ||
    result.answer.length > 8000 ||
    !Array.isArray(result.sourceIds) ||
    !result.sourceIds.every((id) => Number.isSafeInteger(id) && id > 0)
  )
    throw new Error('Invalid answer')
  return {
    answer: result.answer,
    sourceIds: result.sourceIds,
    turn_id: String(turn),
  }
}
