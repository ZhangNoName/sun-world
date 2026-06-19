import type { paths } from './generated-api-types'

export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch'

type JsonContent<T> = T extends {
  content: {
    'application/json': infer Json
  }
}
  ? Json
  : never

type SuccessStatus = 200 | 201 | 202 | 204

type SuccessResponse<Responses> = {
  [Status in SuccessStatus & keyof Responses]: Responses[Status]
}[SuccessStatus & keyof Responses]

export type MethodPath<Method extends HttpMethod> = {
  [Path in keyof paths & string]: Method extends keyof paths[Path]
    ? NonNullable<paths[Path][Method]> extends never
      ? never
      : Path
    : never
}[keyof paths & string]

export type OpenApiOperation<
  Path extends keyof paths & string,
  Method extends HttpMethod,
> = Method extends keyof paths[Path] ? NonNullable<paths[Path][Method]> : never

export type ApiResponseEnvelope<
  Path extends MethodPath<Method>,
  Method extends HttpMethod,
> = JsonContent<
  OpenApiOperation<Path, Method> extends { responses: infer Responses }
    ? SuccessResponse<Responses>
    : never
>

type DefinedData<T> = Exclude<T, undefined>

export type ApiEnvelopeData<Envelope> = Envelope extends {
  data?: infer Data
}
  ? NonNullable<DefinedData<Data>> extends never
    ? null
    : NonNullable<DefinedData<Data>>
  : Envelope

export type ApiSuccessData<
  Path extends MethodPath<Method>,
  Method extends HttpMethod,
> = ApiEnvelopeData<ApiResponseEnvelope<Path, Method>>

export type ApiRequestBody<
  Path extends MethodPath<Method>,
  Method extends HttpMethod,
> = OpenApiOperation<Path, Method> extends {
  requestBody: {
    content: {
      'application/json': infer Body
    }
  }
}
  ? Body
  : never

export type ApiQueryParams<
  Path extends MethodPath<Method>,
  Method extends HttpMethod,
> = OpenApiOperation<Path, Method> extends {
  parameters: {
    query?: infer Query
  }
}
  ? NonNullable<Query> extends never
    ? never
    : NonNullable<Query>
  : never

export type ApiPathParams<
  Path extends MethodPath<Method>,
  Method extends HttpMethod,
> = OpenApiOperation<Path, Method> extends {
  parameters: {
    path?: infer Params
  }
}
  ? NonNullable<Params> extends never
    ? never
    : NonNullable<Params>
  : never
