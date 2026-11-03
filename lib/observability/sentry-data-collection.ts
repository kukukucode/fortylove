// Explicitly disable sensitive collection: SDK v11 defaults are more permissive.
export const sentryDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: false, response: false },
  httpBodies: [],
  urlQueryParams: false,
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
  stackFrameVariables: false,
  frameContextLines: 0,
};
