import type { ApiRoute } from './routes'

export interface ApiEndpoint<
  TPath extends ApiRoute = ApiRoute,
  TMethod extends string = string,
> {
  path: TPath
  method: Uppercase<TMethod>
}
