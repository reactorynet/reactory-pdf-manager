import Reactory from '@reactorynet/reactory-core';
import { PdfServiceDefinition } from './PdfService';

const services: Reactory.Service.IReactoryServiceDefinition<any>[] = [
  PdfServiceDefinition,
];

export default services;
