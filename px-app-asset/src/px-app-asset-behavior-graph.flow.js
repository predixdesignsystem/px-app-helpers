// @flow

(function() {
  'use strict';

  /* Ensures the behavior namespace is created */
  const PxAppBehavior = window.PxAppBehavior = (window.PxAppBehavior || {});

  interface AssetGraphBehaviorInterface {
    properties: *;
    items?: Array<Object>;
    keys?: {
      id?: string,
      label?: string,
      children?: string,
      route?: string,
      icon?: string,
    };
    _assetGraph?: AssetGraph | null;
    _createAssetGraph?: Object;
  }

  /**
   *
   *
   * @polymerBehavior PxAppBehavior.AssetGraph
   */
  const AssetGraphBehavior: AssetGraphBehaviorInterface = {
    properties: {
      /**
       * An array of objects that will be used to build the nav. Top-level items
       * can optionally have one level of children beneath them, turning the
       * top-level item into a dropdown group.
       *
       * Selecting an item automatically selects its parent if it has one.
       * For the navigation, top-level items with children cannot be selected
       * directly - instead, users can select a child item and its parent will
       * also be marked as selected (and set as the `selectedItemParent`).
       *
       * All items should have at least the following properties:
       *
       * - {String} id - A unique string that identifies the item. Should only
       * contain valid ASCII characters. Its recommended to only use URI-safe
       * characters to allow for easy binding to the URL. Examples: 'home' or 'alerts'
       * - {String} label - A short, human-readable text label for the item.
       *
       * The following optional properties can be used:
       *
       * - {Array} children - An array of subitem objects that are children of
       * the item. Each child item should also have an `id` and `label`, and
       * may have its own child items.
       *
       * The following is an example of a list of valid nav items:
       *
       *     [
       *       { "label" : "Home",   "id" : "home" },
       *       { "label" : "Alerts", "id" : "alerts" },
       *       { "label" : "Assets", "id" : "assets", "children": [
       *         { "label" : "Asset #1", "id" : "a1" },
       *         { "label" : "Asset #2", "id" : "a2" }
       *       ] }
       *     ]
       *
       * The item property names can be changed, e.g. to choose a different item
       * property to serve as a unique ID. See the `keys` property for details.
       */
      items: {
        type: Array
      },

      /**
       * Changes the item properties (keys) that will be used internally to find
       * each item's unique ID, label, and child list.
       *
       * Use this property if you already have a predefined data schema for your
       * application and want to customize this component to match your schema.
       * Otherwise, its recommended to leave the defaults.
       *
       * The following properties can be set:
       *
       * - id: [default='id'] a unique ID for the item
       * - label: [default='label'] a human-readable label
       * - children: [default='children'] an array of child items
       *
       * If you want to configure any keys, you must set all the keys. If any
       * of the keys are not defined, the navigation will fail.
       *
       * For example, the schema could be changed to the following:
       *
       *     {
       *       "id" : "assetId",
       *       "label" : "assetName",
       *       "children" : "subAssets"
       *     }
       *
       */
      keys: {
        type: Object,
        value: function() {
          return {
            'id' : 'id',
            'icon' : 'icon',
            'children' : 'children',
            'route' : 'route'
          }
        }
      },

      /**
       * Enables logging of recoverable issues with the component's asset
       * graph to the console.
       */
      enableWarnings: {
        type: Boolean,
        value: false,
        observer: '_toggleAssetGraphWarnings'
      }
    },

    observers: [
      '_handleAssetsChanged(items, items.*, keys, keys.*)'
    ],

    created() {
      this._assetGraph = null;
      this._createAssetGraph = PxApp.assetGraph.bind(this);
    },

    _handleAssetsChanged(items: Array<Object>, itemsRef: Object, keys: { id?: string, label?: string, children?: string, route?: string }, keysRef: Object): AssetGraph | typeof undefined {
      if (this._assetGraph === null && typeof items === 'object' && Array.isArray(items)) {
        this._assetGraph = this._createAssetGraph(items, {
          idKey: keys.id,
          childrenKey: keys.children,
          routeKey: keys.route,
          enableWarnings: this.enableWarnings
        });
        this.fire('px-app-asset-graph-created', {graph:this._assetGraph});
        return this._assetGraph;
      }
    },

    _toggleAssetGraphWarnings(val) {
      if (this._assetGraph && this._assetGraph.enableWarnings !== val) {
        this._assetGraph.enableWarnings = val;
      }
    }
  };
  PxAppBehavior.AssetGraph = AssetGraphBehavior;

  type AssetNode = {
    node: Object,
    parent: Object | null,
    children: Array<Object>,
    id: string,
    path: Array<Object>,
    route: Array<string>,
    siblings: Array<Object>,
  };

  class AssetGraph {
    nodes: Array<any>;
    _idKey: string;
    _childrenKey: string;
    _routeKey: string;
    _nodeCache: WeakMap<Object, AssetNode>;
    is: string;
    enableWarnings: boolean;

    constructor(nodes: Array<Object>, opts={}) {
      this.nodes = nodes;
      this.enableWarnings = typeof opts.enableWarnings === 'boolean' ? opts.enableWarnings : false;
      this._idKey = opts.idKey || 'id';
      this._childrenKey = opts.childrenKey || 'children';
      this._routeKey = opts.routeKey || 'route';
      this._nodeCache = this._traceNodes(nodes, this._idKey, this._childrenKey, this._routeKey);
    }

    _traceNodes(nodes: Array<Object>, idKey: string, childrenKey: string, routeKey: string): WeakMap<Object, AssetNode> {
      const traces = new WeakMap();
      const routeFor = this._extractRoute.bind(this, idKey, routeKey);
      const visitedNodes: Array<Object> = [];
      const visitedIds: Array<string> = [];
      let nodeQueue = nodes.map(n => ({ node: n, parent: null, path: [n], route: [routeFor(n)], siblings: nodes }));

      while (nodeQueue.length) {
        let {node, parent, path, route, siblings} = nodeQueue.shift();

        if (this.enableWarnings) {
          if (visitedNodes.indexOf(node) > -1) {
            console.warn(`PX-APP-ASSET-GRAPH WARNING:
              The following node was found more than once in the ${this.is} asset graph.
              Nodes should be unique and only appear once in the graph. Placing a node
              in the graph more than once may cause issues:`);
            console.warn(node);
          }
          else if (visitedIds.indexOf(node[idKey]) > -1) {
            console.warn(`PX-APP-ASSET-GRAPH WARNING:
              The following unique ID was found more than once in the ${this.is} asset graph.
              Unique IDs should be used for only one node in the graph. Using a unique ID
              for more than one node in the graph may cause issues:`);
            console.warn(node);
          }
          visitedNodes.push(node);
          visitedIds.push(node[idKey]);
        }

        visitedNodes.push(node);
        visitedIds.push(node[idKey]);
        let nodeInfo = {
          node: node,
          parent: parent,
          children: node.hasOwnProperty(childrenKey) && Array.isArray(node[childrenKey]) ? node[childrenKey] : [],
          id: node[idKey],
          path: path,
          route: route,
          siblings: siblings
        }
        if (nodeInfo.children.length) {
          let childNodes = nodeInfo.children.map(n => ({ node: n, parent: node, path: path.concat([n]), route: route.concat([routeFor(n)]), siblings: nodeInfo.children }));
          nodeQueue = nodeQueue.concat(childNodes);
        }
        traces.set(node, nodeInfo);
      }

      return traces;
    }

    _extractRoute(idKey: string, routeKey: string, node: Object): string {
      return node.hasOwnProperty(routeKey) ? node[routeKey] : node[idKey];
    }

    getNodeInfo(node: Object): AssetNode | typeof undefined {
      return this._nodeCache.get(node);
    }

    hasNode(node: Object): boolean {
      return this._nodeCache.has(node);
    }

    getPathTo(node: Object): Array<Object> | typeof undefined {
      let nodeInfo = this.getNodeInfo(node);
      if (!nodeInfo) return undefined;
      return nodeInfo.path.slice(0);
    }

    getRouteTo(node): Array<string> | typeof undefined {
      let nodeInfo = this.getNodeInfo(node);
      if (!nodeInfo) return undefined;
      return nodeInfo.route.slice(0);
    }

    getParentOf(node: Object): Object | null | typeof undefined {
      let nodeInfo = this.getNodeInfo(node);
      if (!nodeInfo) return undefined;
      return nodeInfo.parent;
    }

    getChildrenOf(node: Object): Array<Object> | typeof undefined {
      let nodeInfo = this.getNodeInfo(node);
      if (!nodeInfo) return undefined;
      return nodeInfo.children;
    }

    getSiblingsOf(node: Object): Array<Object> | typeof undefined {
      let nodeInfo = this.getNodeInfo(node);
      if (!nodeInfo) return undefined;
      return nodeInfo.siblings;
    }

    getNodeAtRoute(route: Array<string>): Object | typeof undefined {
      const routeFor = this._extractRoute.bind(this, this._idKey, this._routeKey)
      const hasChildren = (item) => item.hasOwnProperty(this._childrenKey) && item[this._childrenKey].length > 0;
      let foundItem;
      let searchRoute = route.slice(0);
      let items = this.nodes.slice(0);

      while (!foundItem && items.length > 0 && searchRoute.length > 0) {
        let item = items.shift();
        if (routeFor(item) === searchRoute[0] && hasChildren(item) && searchRoute.length !== 1) {
          searchRoute.shift();
          items = item[this._childrenKey].slice(0);
        }
        if (routeFor(item) === searchRoute[0] && searchRoute.length === 1) {
          foundItem = item;
          break;
        }
      }

      return foundItem;
    }
  };

  function assetGraph(nodes: Array<Object>, options: Object): AssetGraph {
    return new AssetGraph(nodes, options);
  };

  const PxApp = window.PxApp = (window.PxApp || {});
  PxApp.AssetGraph = AssetGraph;
  PxApp.assetGraph = assetGraph;
})();
