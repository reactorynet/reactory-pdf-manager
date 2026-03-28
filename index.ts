import Reactory from '@reactorynet/reactory-core';
import services from './services';
import pdfs from './pdfs';
import types from './graph/types';
import resolvers from './graph/resolvers';

const ReactoryPdfManagerModule: Reactory.Server.IReactoryModule = {
  id: 'reactory-pdf-manager',
  nameSpace: 'pdf-manager',
  version: '1.0.0',
  name: 'ReactoryPdfManager',
  dependencies: ['reactory-core'],
  priority: 5,
  graphDefinitions: {
    Types: [...types],
    Resolvers: resolvers,
  },
  workflows: [],
  forms: [],
  services: [...services],
  models: [],
  routes: [],
  translations: [],
  clientPlugins: [],
  serverPlugins: [],
  cli: [],
  description: 'PDF management module providing generation, extraction, and manipulation capabilities.',
  grpc: null,
  passportProviders: [],
  pdfs: [...pdfs],
  middleware: [],
};

export default ReactoryPdfManagerModule;
