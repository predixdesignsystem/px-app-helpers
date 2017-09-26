(function () {
  'use strict';

  /* Ensures the behavior namespace is created */

  const PxAppBehavior = window.PxAppBehavior = window.PxAppBehavior || {};

  /**
   *
   *
   * @polymerBehavior PxAppBehavior.AssetGraph
   */
  const AssetGraphBehavior = {
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
       * contain valid ASCII characters. It's recommended to only use URI-safe
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
       * Otherwise, it's recommended to leave the defaults.
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
        value: function () {
          return {
            'id': 'id',
            'label': 'label',
            'children': 'children',
            'icon': 'icon'
          };
        }
      },

      _assetGraph: {
        type: Object,
        value: null
      },
      __rootItems: {
        type: Array
      }
    },

    observers: ['__handleAssetReferenceChanged(items, keys)', '__handleKeyUpdated(keys.*)'],

    created() {
      this._createAssetGraph = PxApp.assetGraph.bind(this);
    },

    __handleAssetReferenceChanged: function (items, keys) {
      if (typeof items === 'object' && Array.isArray(items)) {
        if (this._assetGraph !== null) {
          // The items were re-assigned to a new object, re-build the asset graph
          // and dump all the previous data and state
          if (typeof this.activate === 'function') {
            this.activate(null);
          }
          if (typeof this.select === 'function') {
            this.select(null);
          }
        }

        this._assetGraph = this._createAssetGraph();
        this._assetGraph.addChildren(null, items, {
          recursive: true,
          childrenKey: keys.children
        });
        this.__rootItems = items.slice(0);
        this.fire('px-app-asset-graph-created', { graph: this._assetGraph });
        return this._assetGraph;
      }
    },

    __handleKeyUpdated: function (record) {
      if (!this._assetGraph) {
        return;
      }
      if (record.path === 'keys.children') {
        this.__handleAssetReferenceChanged(this.items, this.keys);
      }
      if (record.path === 'keys.id') {
        // The items were re-assigned to a new object, re-build the asset graph
        // and dump all the previous data and state
        if (typeof this.activate === 'function') {
          this.activate(null);
        }
        if (typeof this.select === 'function') {
          this.select(null);
        }
      }
    },

    /**
     * Adds a child or children to the requested node. Pass a single object
     * to add one child, or an array of objects to add multiple children.
     *
     * The `node` should be a direct reference to one of the objects already
     * in the asset graph (e.g. one of the `items` objects or another node
     * added through the `addChildren` API). To remove children from the root
     * of the graph, call with `node` as null.
     *
     * @param  {Object|null} node
     * @param  {Object|Array<Object>} children
     */
    addChildren(node, children, options) {
      if (this._assetGraph !== null) {
        this._assetGraph.addChildren(node, children, Object.assign({}, {
          recursive: true,
          childrenKey: this.keys.children
        }, options || {}));
        if (node === null) {
          let childrenArray = Array.isArray(children) ? children : [children];
          this.__rootItems = this.__rootItems.concat(childrenArray);
        }
        this.fire('px-app-asset-children-updated', node === null ? { item: null, added: children, children: this.__rootItems } : Object.assign({}, this._assetGraph.getInfo(node), { added: children }));
      }
    },

    /**
     * Removes a child or children from the requested node. Pass `children` a
     * single object to remove one child, an array of objects to remove multiple
     * children, or null to remove all children.
     *
     * The `node` should be a direct reference to one of the objects already
     * in the asset graph (e.g. one of the `items` objects or another node
     * added through the `addChildren` API). To add children to the root
     * of the graph, call with `node` as null.
     *
     * @param  {Object|null} node
     * @param  {Object|Array<Object>} children
     */
    removeChildren(node, children, options) {
      if (this._assetGraph !== null) {
        const childrenArray = Array.isArray(children) ? children : [children];

        if (typeof this.activate === 'function' || typeof this.select === 'function') {
          // Deactivate or deselect if the active/selected items are in the path
          // of one of the removed items
          let deactivated;
          let deselected;
          for (let i = 0; i < childrenArray.length; i++) {
            if (!deactivated && typeof this.activate === 'function' && this.activeMeta && (this.activeMeta.item === childrenArray[i] || this.activeMeta.path && this.activeMeta.path.indexOf(childrenArray[i]) > -1)) {
              this.activate(null);
              deactivated = true;
            }
            if (!deselected && typeof this.select === 'function' && this.selectedMeta && (this.selectedMeta.item === childrenArray[i] || this.selectedMeta.path && this.selectedMeta.path.indexOf(childrenArray[i]) > -1)) {
              this.select(null);
              deactivated = true;
            }
          }
        }

        this._assetGraph.removeChildren(node, children, options);
        if (node === null) {
          this.__rootItems = this.__rootItems.filter(item => childrenArray.indexOf(item) === -1);
        }
        this.fire('px-app-asset-children-updated', node === null ? { item: null, removed: children, children: this.__rootItems } : Object.assign({}, this._assetGraph.getInfo(node), { removed: children }));
      }
    }
  };
  PxAppBehavior.AssetGraph = AssetGraphBehavior;

  class AssetGraph {

    constructor(options) {
      /* Save options  */
      this._options = {};

      /* Add default keys */
      this._defaultKeys = {
        id: 'id',
        children: 'children'
      };

      /* Initialize SymbolTree and prepare its root node */
      this._tree = new SymbolTree();
      this._rootNode = { ROOT: true };
      this._symbol = Symbol('AssetGraph data');
    }

    _node(object) {
      const node = object[this._symbol];

      if (node) {
        return node;
      } else {
        return object[this._symbol] = { isExhausted: null, isTerminal: null };
      }
    }

    _getKey(key, val) {
      return val && typeof val === 'string' && val.length ? val : this._defaultKeys[key];
    }

    /**
     * Checks if the node is in the graph.
     *
     * @param  {Object} node
     * @return {boolean}
     */
    hasNode(node) {
      if (this._tree.index(node) > -1) {
        return true;
      }
      return false;
    }

    getInfo(node, routeKey) {
      if (this._tree.index(node) > -1) {
        const _routeKey = this._getKey('id', routeKey);
        const path = this.getPath(node);
        const route = path ? AssetGraph.pathToRoute(path, _routeKey) : null;
        const parent = this.getParent(node);
        const siblings = this.getSiblings(node);
        const children = this.getChildren(node);
        const hasChildren = typeof children === 'object' && Array.isArray(children) && children.length > 0;
        const isTerminal = this.isTerminal(node);
        const isExhausted = this.isExhausted(node);

        return {
          item: node,
          path: path,
          route: route,
          parent: parent,
          siblings: siblings,
          children: children,
          hasChildren: hasChildren,
          isTerminal: isTerminal,
          isExhausted: isExhausted
        };
      }
      return null;
    }

    /**
     * Returns a reference to the node's parent. If the node has no parent or is
     * not in the graph, returns null.
     *
     * @param  {Object} node
     * @return {Object|null}
     */
    getParent(node) {
      if (node && this._tree.index(node) > -1) {
        const parent = this._tree.parent(node);
        return parent !== this._rootNode ? parent : null;
      }
      return null;
    }

    /**
     * This method returns whether or not the passed in item as any siblings.
     * @param {Object} node
     */
    hasSiblings(node) {
      var siblings = this.getSiblings(node);
      return siblings && siblings.length > 1;
    }

    /**
     * Returns a reference to the node's siblings (the children of its parent).
     * The returned array includes the node.
     *
     * @param  {Object} node
     * @return {Array<Object>|null}
     */
    getSiblings(node) {
      if (node && this._tree.index(node) > -1) {
        return this._tree.childrenToArray(this._tree.parent(node));
      }
      return null;
    }

    /**
     * Returns an array of ancestor nodes from the root of the graph to the requested
     * node. The returned array includes the node.
     *
     * @param  {Object} node
     * @return {Array<Object>|null}
     */
    getPath(node) {
      if (node && this._tree.index(node) > -1) {
        // reverse so its root->node, slice to remove the virtual root node
        return this._tree.ancestorsToArray(node).reverse().slice(1);
      }
      return null;
    }

    /**
     * Returns an array of unique IDs for each ancestor of the requested node
     * starting at the root of the graph and ending with the requested node.
     *
     * @param  {Object} node
     * @return {Array<string>|null}
     */
    getRoute(node, routeKey) {
      if (node && this._tree.index(node) > -1) {
        const _routeKey = typeof routeKey === 'string' && routeKey.length ? routeKey : this._defaultKeys.id;
        const ancestors = this.getPath(node);
        // if (!ancestors) return null;
        // const path = [];
        // for (let i=0; i<ancestors.length; i++) {
        //   path.push(typeof ancestors[i][_routeKey] === 'string' && ancestors[i][_routeKey].length ? ancestors[i][_routeKey] : null);
        // }
        // return path;
        return ancestors ? AssetGraph.pathToRoute(ancestors, _routeKey) : null;
      }
      return null;
    }

    getNodeAtRoute(route, routeKey) {
      if (typeof route !== 'object' || !Array.isArray(route) || !route.length) {
        throw new Error('An array of route strings is required.');
      }

      const _routeKey = typeof routeKey === 'string' && routeKey.length ? routeKey : this._defaultKeys.id;
      let searchRoute = route.slice(0);
      let items = this._tree.childrenToArray(this._rootNode).slice(0);
      let foundItem = null;

      while (!foundItem && items.length > 0 && searchRoute.length > 0) {
        let item = items.shift();
        if (item[_routeKey] === searchRoute[0] && this._tree.childrenCount(item) > 0 && searchRoute.length !== 1) {
          searchRoute.shift();
          items = this._tree.childrenToArray(item).slice(0);
          continue;
        }
        if (item[_routeKey] === searchRoute[0] && searchRoute.length === 1) {
          foundItem = item;
          break;
        }
      }

      return foundItem;
    }

    /**
     * Returns a reference to the requested node's children. The returned array
     * will be empty if no children are defined.
     *
     * @param  {Object} node
     * @return {Array<Object>|null}
     */
    getChildren(node) {
      const _node = node === null ? this._rootNode : node;
      if (_node && (_node.ROOT || this._tree.index(_node) > -1)) {
        return this._tree.childrenToArray(_node);
      }
      return null;
    }

    /**
     * Returns a reference to the root node's children. The returned array will
     * be empty if no children are defined.
     *
     * @return {Array<Object>|null}
     */
    getRootChildren() {
      const _node = this._rootNode;
      if (_node) {
        return this._tree.childrenToArray(_node);
      }
      return null;
    }

    /**
     * Checks if the node has any children.
     *
     * @param  {Object} node
     * @return {boolean|null}
     */
    hasChildren(node) {
      const _node = node === null ? this._rootNode : node;
      if (_node && (_node.ROOT || this._tree.index(_node) > -1)) {
        return this._tree.childrenCount(_node) > 0;
      }
      return null;
    }

    /**
     * Adds a child or children to the requested node. Can pass a single object
     * to add one child, or an array of objects to add multiple children.
     * If `node` is null, the child object(s) will be added to the root of the graph.
     *
     * @param  {Object|null} node
     * @param  {Object|Array<Object>} children
     * @return {Array<Object>|undefined} the updated child array of the node
     */
    addChildren(node, children, options) {
      if (typeof children !== 'object' || Array.isArray(children) && !children.length) {
        throw new Error('A child object or array of child objects is required.');
      }

      if (node !== null && typeof node === 'object' && !this.hasNode(node)) {
        throw new Error('The parent node must be a node in the graph or null.');
      }

      const parent = node !== null ? node : this._rootNode;
      const childArray = Array.isArray(children) ? children : [children];
      const childKey = typeof options === 'object' && typeof options.childrenKey === 'string' && options.childrenKey.length ? options.childrenKey : this._defaultKeys.children;
      const isRecursive = typeof options === 'object' && typeof options.recursive === 'boolean' ? options.recursive : false;
      for (let i = 0; i < childArray.length; i++) {
        const info = this._node(childArray[i]);
        info.isTerminal = childArray[i].hasOwnProperty('isTerminal') ? childArray[i].isTerminal : null;
        info.isExhausted = childArray[i].hasOwnProperty('isExhausted') ? childArray[i].isExhausted : null;
        this._tree.appendChild(parent, childArray[i]);
        if (isRecursive && typeof childArray[i][childKey] === 'object' && Array.isArray(childArray[i][childKey]) && childArray[i][childKey].length) {
          this.addChildren(childArray[i], childArray[i][childKey], { recursive: true, childrenKey: childKey });
        }
      }

      if (typeof options === 'object' && typeof options.isExhausted === 'boolean') {
        const isExhausted = options.isExhausted;
        const info = this._node(parent);
        info.isExhausted = isExhausted;
      }

      return this.getChildren(parent);
    }

    /**
     * Removes a child or children from the requested node. Can pass a single object
     * by reference to remove one child, or an array of objects by reference to
     * remove multiple children. If `node` is null, the child object(s) will be
     * removed from the root of the graph.
     *
     * @param  {Object|null} node
     * @param  {Object|Array<Object>} children
     * @return {Array<Object>|undefined} the updated child array of the node
     */
    removeChildren(node, children, options) {
      if (typeof children !== 'object' || Array.isArray(children) && !children.length) {
        throw new Error('A child object or array of child objects is required.');
      }

      if (node !== null && typeof node === 'object' && !this.hasNode(node)) {
        throw new Error('The parent node must be a node in the graph or null.');
      }

      const parent = node !== null ? node : this._rootNode;
      const childArray = Array.isArray(children) ? children : [children];
      for (let i = 0; i < childArray.length; i++) {
        if (!this.hasNode(childArray[i])) {
          throw new Error('Child node(s) cannot be removed from the graph if it they were never added');
        }
        if (node !== null && this.getParent(childArray[i]) !== parent || node == null && this.getParent(childArray[i]) !== null) {
          throw new Error('Child node(s) passed to "removeChildren" method must be children of the given parent');
        }
        this._tree.remove(childArray[i]);
      }
    }

    isExhausted(node) {
      const _node = node === null ? this._rootNode : node;
      if (_node && (_node.ROOT || this._tree.index(_node) > -1)) {
        const info = this._node(_node);
        return info && info.isExhausted === true ? true : false;
      }
      return null;
    }

    setExhausted(node, isExhausted) {
      const _node = node === null ? this._rootNode : node;
      if (_node && (_node.ROOT || this._tree.index(_node) > -1)) {
        const info = this._node(_node);
        info.isExhausted = isExhausted;
        return isExhausted;
      }
      return null;
    }

    isTerminal(node) {
      if (node === null) {
        // The root node can never be terminal, it must have children
        return false;
      }
      if (this._tree.index(node) > -1) {
        const info = this._node(node);
        return info && info.isTerminal === true ? true : false;
      }
      return null;
    }

    setTerminal(node, isTerminal) {
      if (node === null) {
        // The root node can never be terminal, it must have children
        throw new Error('The root node can never be terminal, it must have children.');
      }
      if (this._tree.index(node) > -1) {
        const info = this._node(node);
        info.isTerminal = isTerminal;
        return isTerminal;
      }
      return null;
    }

    static pathToRoute(path, routeKey) {
      return path.map(p => typeof p[routeKey] === 'string' && p[routeKey].length ? p[routeKey] : null);
    }
  };

  function assetGraph(options) {
    return new AssetGraph(options);
  };

  const PxApp = window.PxApp = window.PxApp || {};
  PxApp.AssetGraph = AssetGraph;
  PxApp.assetGraph = assetGraph;
})();
