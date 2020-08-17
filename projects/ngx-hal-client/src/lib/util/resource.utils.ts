import { BaseResource } from '../model/resource/base-resource';
import { isEmbeddedResource, isResource } from '../model/resource-type';
import { ResourceCollection } from '../model/resource/resource-collection';
import { PagedResourceCollection } from '../model/resource/paged-resource-collection';
import { Include, Link, PageData, RequestBody } from '../model/declarations';
import * as _ from 'lodash';
import { Resource } from '../model/resource/resource';
import { EmbeddedResource } from '../model/resource/embedded-resource';
import { UrlUtils } from './url.utils';

/* tslint:disable:no-string-literal */
export class ResourceUtils {

  private static resourceType: new() => BaseResource;

  private static resourceCollectionType: new() => ResourceCollection<BaseResource>;

  private static pagedResourceCollectionType: new(collection: ResourceCollection<BaseResource>, pageData?: PageData)
    => PagedResourceCollection<BaseResource>;

  private static embeddedResourceType: new() => EmbeddedResource;

  public static useResourceType(type: new () => Resource) {
    this.resourceType = type;
  }

  public static useResourceCollectionType(type: new() => ResourceCollection<BaseResource>) {
    this.resourceCollectionType = type;
  }

  public static usePagedResourceCollectionType(type: new(collection: ResourceCollection<BaseResource>)
    => PagedResourceCollection<BaseResource>) {
    this.pagedResourceCollectionType = type;
  }

  public static useEmbeddedResourceType(type: new() => EmbeddedResource) {
    this.embeddedResourceType = type;
  }

  public static instantiateResource<T extends BaseResource>(payload: object): T {
    // @ts-ignore
    if (_.isEmpty(payload)
      || (!_.isObject(payload['_links']) || _.isEmpty(payload['_links']))) {
      return null;
    }
    for (const key of Object.keys(payload)) {
      if (_.isArray(payload[key])) {
        for (let i = 0; i < payload[key].length; i++) {
          if (isEmbeddedResource(payload[key][i])) {
            payload[key][i] = ResourceUtils.createResource(new this.embeddedResourceType(), payload[key][i]);
          } else if (isResource(payload[key][i])) {
            payload[key][i] = ResourceUtils.createResource(new this.resourceType(), payload[key][i]);
            payload[key][i]['resourceName'] = this.findResourceName(payload[key][i]);
          }
        }
      } else if (isEmbeddedResource(payload[key])) {
        payload[key] = ResourceUtils.createResource(new this.embeddedResourceType(), payload[key]);
      } else if (isResource(payload[key])) {
        payload[key] = ResourceUtils.createResource(new this.resourceType(), payload[key]);
        payload[key]['resourceName'] = this.findResourceName(payload[key]);
      }
    }

    const resource = Object.assign(new this.resourceType() as T, payload);
    resource['resourceName'] = this.findResourceName(resource);

    return resource;
  }


  public static instantiateResourceCollection<T extends ResourceCollection<BaseResource>>(payload: object): T {
    if (_.isEmpty(payload)
      || (!_.isObject(payload['_links']) || _.isEmpty(payload['_links']))
      || (!_.isObject(payload['_embedded']) || _.isEmpty(payload['_embedded']))) {
      return null;
    }
    const result = new this.resourceCollectionType() as T;
    for (const resourceName of Object.keys(payload['_embedded'])) {
      payload['_embedded'][resourceName].forEach((resource) => {
        result.resources.push(this.instantiateResource(resource));
      });
    }
    result['_links'] = {...payload['_links']};

    return result;
  }

  public static instantiatePagedResourceCollection<T extends PagedResourceCollection<BaseResource>>(payload: object): T {
    const resourceCollection = this.instantiateResourceCollection(payload);
    if (resourceCollection == null) {
      return null;
    }

    let result;
    if (payload['page']) {
      result = new this.pagedResourceCollectionType(resourceCollection, payload as PageData);
    } else {
      result = new this.pagedResourceCollectionType(resourceCollection);
    }
    return result as T;
  }

  /**
   * Resolve request body relations.
   * If request body has {@link Resource} value then this value will be replaced by resource self link.
   * If request body has {@link ValuesOption} it will be applied to body values.
   *
   * @param requestBody that contains the body directly and optional body values option {@link ValuesOption}
   */
  public static resolveValues(requestBody: RequestBody<any>): any {
    if (_.isEmpty(requestBody) || _.isNil(requestBody.body)
      || (_.isObject(requestBody.body) && _.isEmpty(requestBody.body))) {
      return null;
    }
    const body = requestBody.body;
    if (!_.isObject(body) || _.isArray(body)) {
      return body;
    }

    const result: object = {};
    for (const key in body) {
      if (!body.hasOwnProperty(key)) {
        continue;
      }
      if (body[key] == null && Include.NULL_VALUES === requestBody?.valuesOption?.include) {
        result[key] = null;
        continue;
      }
      if (_.isNil(body[key])) {
        continue;
      }
      if (_.isArray(body[key])) {
        const array: any[] = body[key];
        result[key] = [];
        array.forEach((element) => {
          if (isResource(element)) {
            result[key].push(element?._links?.self?.href);
          } else {
            result[key].push(this.resolveValues({body: element, valuesOption: requestBody?.valuesOption}));
          }
        });
      } else if (isResource(body[key])) {
        result[key] = body[key]._links?.self?.href;
      } else {
        result[key] = body[key];
      }
    }
    return result;
  }

  /**
   * Assign {@link Resource} or {@link EmbeddedResource} properties to passed entity.
   *
   * @param entity to be converter to resource
   */
  public static initResource(entity: any): BaseResource | any {
    if (isResource(entity)) {
      return Object.assign(new this.resourceType(), entity);
    } else if (isEmbeddedResource(entity)) {
      return Object.assign(new this.embeddedResourceType(), entity);
    } else {
      return entity;
    }
  }

  /**
   * Define resource name based on resource links.
   * It will get link name that href equals to self href resource link.
   *
   * @param resource for which to find the name
   */
  private static findResourceName(resource: BaseResource): string {
    // @ts-ignore
    const resourceLinks = resource._links as Link;
    if (_.isEmpty(resourceLinks) || _.isEmpty(resourceLinks.self) || _.isNil(resourceLinks.self.href)) {
      return undefined;
    }
    const selfLink = resourceLinks.self.href;

    for (const link of Object.keys(resourceLinks)) {
      if (link !== 'self' && UrlUtils.removeTemplateParams(resourceLinks[link].href) === selfLink) {
        return _.upperFirst(link);
      }
    }
  }

  private static createResource<T extends BaseResource>(entity: T, payload: any): T {
    return Object.assign(entity, payload);
  }

}
