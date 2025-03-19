import { APIClient } from '@heroku-cli/command';
import { App, Space, DynoSize, TeamApp, Pipeline, Generation, AppGeneration, DynoSizeGeneration, PipelineGeneration } from '../types/fir';
import Dyno from '../run/dyno';
export declare type GenerationKind = 'fir' | 'cedar';
export declare type GenerationLike = Generation | AppGeneration | DynoSizeGeneration | PipelineGeneration | Dyno;
export declare type GenerationCapable = App | Space | DynoSize | TeamApp | Pipeline;
/**
 * Get the generation of an object
 *
 * @param source The object to get the generation from
 * @returns The generation of the object
 */
export declare function getGeneration(source: GenerationLike | GenerationCapable | string): GenerationKind | undefined;
/**
 * Get the generation of an app by id or name
 *
 * @param appIdOrName The id or name of the app to get the generation for
 * @param herokuApi The Heroku API client to use
 * @returns The generation of the app
 */
export declare function getGenerationByAppId(appIdOrName: string, herokuApi: APIClient): Promise<GenerationKind | undefined>;
