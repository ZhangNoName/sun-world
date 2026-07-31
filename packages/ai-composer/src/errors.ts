export class AiComposerSubmitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiComposerSubmitError'
  }
}
