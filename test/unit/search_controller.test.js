import { expect } from 'chai';
import sinon from 'sinon';
import { BaseSearchSource, UserSearchSource, ChannelSearchSource, MessageSearchSource, SearchController } from '../../src/search_controller';
import {generateUser} from "./test-utils/generateUser";
import {generateChannel} from "./test-utils/generateChannel";


describe('SearchController', () => {
  let searchController;
  let mockSource;
  let mockSource2;

  beforeEach(() => {
    // Create a mock search source
    mockSource = {
      type: 'test',
      activate: sinon.stub(),
      deactivate: sinon.stub(),
      hasMore: false,
      hasResults: false,
      isActive: false,
      isLoading: false,
      items: undefined,
      lastQueryError: undefined,
      next: undefined,
      offset: undefined,
      resetState: sinon.stub(),
      search: sinon.stub().resolves(),
      searchDebounced: sinon.stub(),
      searchQuery: '',
      setDebounceOptions: sinon.stub(),
      state: {}
    };
    
    mockSource2 = { type: 'test2', 
     activate: sinon.stub(),
     deactivate: sinon.stub(),
     hasMore: false,
     hasResults: false,
     isActive: false,
     isLoading: false,
     items: undefined,
     lastQueryError: undefined,
     next: undefined,
     offset: undefined,
     resetState: sinon.stub(),
     search: sinon.stub().resolves(),
     searchDebounced: sinon.stub(),
     searchQuery: '',
     setDebounceOptions: sinon.stub(),
     state: {} 
   };
  });


  describe('initialization', () => {
    it('initiates with default configuration', () => {
      searchController = new SearchController();
      expect(searchController.config.keepSingleActiveSource).to.be.true;
      expect(searchController.sources).to.be.an('array').that.is.empty;
      expect(searchController.isActive).to.be.false;
    });

    it('initiates with custom configuration and sources', () => {
      searchController = new SearchController({
        config: { keepSingleActiveSource: false },
        sources: [mockSource]
      });
      
      expect(searchController.config.keepSingleActiveSource).to.be.false;
      expect(searchController.sources).to.have.lengthOf(1);
      expect(searchController.sources[0]).to.eql(mockSource);
      expect(searchController.isActive).to.be.false;
    });
  });

  describe('source management', () => {
    beforeEach(() => {
      searchController = new SearchController();
    });

    it('adds a source correctly', () => {
      searchController.addSource(mockSource);
      expect(searchController.sources).to.have.lengthOf(1);
      expect(searchController.getSource('test')).to.equal(mockSource);
    });

    it('removes a source correctly', () => {
      searchController.addSource(mockSource);
      searchController.removeSource('test');
      expect(searchController.sources).to.have.lengthOf(0);
    });

    it('activates a source with single active source policy', () => {
      searchController.addSource(mockSource);
      searchController.addSource(mockSource2);

      searchController.activateSource('test');
      sinon.assert.calledOnce(mockSource.activate);
    });

    it('deactivates other sources when activating a new one with keepSingleActiveSource', () => {
      const mockSource2Active = { ...mockSource2, isActive: true };
      searchController.addSource(mockSource);
      searchController.addSource(mockSource2Active);

      searchController.activateSource('test');
      sinon.assert.calledOnce(mockSource2Active.deactivate);
    });

    it('activates first source when no sources are active and keepSingleActiveSource is true', () => {
      searchController.addSource(mockSource);
      searchController.addSource(mockSource2);

      searchController.activate();

      sinon.assert.calledOnce(mockSource.activate);
      sinon.assert.notCalled(mockSource2.activate);
    });

    it('activates all sources when no sources are active and keepSingleActiveSource is false', () => {
      searchController = new SearchController({
        config: { keepSingleActiveSource: false }
      });
      searchController.addSource(mockSource);
      searchController.addSource(mockSource2);

      searchController.activate();

      sinon.assert.calledOnce(mockSource.activate);
      sinon.assert.calledOnce(mockSource2.activate);
    });

    it('does not activate sources if there are already active sources', () => {
      const mockSource2Active = { ...mockSource2, isActive: true };
      searchController.addSource(mockSource);
      searchController.addSource(mockSource2Active);

      searchController.activate();

      sinon.assert.notCalled(mockSource.activate);
    });
    
    it('sets controller state to active', () => {
      searchController.activate();
      expect(searchController.isActive).to.be.true;
    });
    
    it('does not modify state if already active', () => {
      const stateListener = sinon.spy();
      const unsubscribe = searchController.state.subscribe(stateListener);
      sinon.assert.calledOnce(stateListener);
      
      searchController.activate();
      sinon.assert.calledTwice(stateListener);
      searchController.activate();
      sinon.assert.calledTwice(stateListener);

      unsubscribe();
    });
  });

  describe('search operations', () => {
    beforeEach(() => {
      searchController = new SearchController({ sources: [mockSource] });
    });

    it('performs search on active sources', async () => {
      mockSource.isActive = true;
      await searchController.search('query');
      sinon.assert.calledWith(mockSource.search, 'query');
    });

    it('updates search query in state', async () => {
      await searchController.search('test query');
      expect(searchController.searchQuery).to.equal('test query');
    });

    it('clears search state correctly', () => {
      searchController.clear();
      expect(searchController.searchQuery).to.equal('');
      sinon.assert.called(mockSource.resetState);
    });

    it('exits search mode correctly', () => {
      searchController.exit();
      expect(searchController.isActive).to.be.false;
      expect(searchController.searchQuery).to.equal('');
      sinon.assert.called(mockSource.resetState);
    });
  });

  describe('state management', () => {
    beforeEach(() => {
      searchController = new SearchController({ sources: [mockSource] });
    });

    it('correctly reports hasMore state', () => {
      mockSource.hasMore = true;
      expect(searchController.hasMore).to.be.true;
    });

    it('correctly filters active sources', () => {
      mockSource.isActive = true;
      expect(searchController.activeSources).to.have.lengthOf(1);
      mockSource.isActive = false;
      expect(searchController.activeSources).to.have.lengthOf(0);
    });

    it('maintains list of search source types', () => {
      expect(searchController.searchSourceTypes).to.deep.equal(['test']);
    });
  });
});



describe('BaseSearchSource and implementations', () => {
  let mockClient;
  const users  = Array.from({length: 2},generateUser);
  const channels = Array.from({length: 2},generateChannel);
  const results = [{id: 'result'}];

  beforeEach(() => {
    mockClient = {
      user: { id: 'current-user' },
      userID: 'current-user',
      queryUsers: sinon.stub().resolves({ users }),
      queryChannels: sinon.stub().resolves(channels),
      search: sinon.stub().resolves({ results, next: null }),
      activeChannels: {}
    };
  });

  describe('BaseSearchSource', () => {
    // Create a concrete implementation for testing abstract class
    const items = [
      {id: 'X'}
    ];
    class TestSearchSource extends BaseSearchSource {
      type = 'test';
      constructor(options) {
        super(options);
      }
      query(searchQuery) {
        return Promise.resolve({ items });
      }
      filterQueryResults(items) {
        return items;
      }
    }

    let searchSource;

    beforeEach(() => {
      searchSource = new TestSearchSource();
    });

    it('initializes with default options', () => {
      expect(searchSource.pageSize).to.equal(10);
      expect(searchSource.searchQuery).to.equal('')
      expect(searchSource.isActive).to.be.false;
      expect(searchSource.isLoading).to.be.false;
      expect(searchSource.hasMore).to.be.true;
      expect(searchSource.items).to.be.undefined;
      expect(searchSource.offset).to.be.eql(0);
    });

    it('initializes with custom options', () => {
      searchSource = new TestSearchSource({ pageSize: 20, isActive: true });
      expect(searchSource.pageSize).to.equal(20);
      expect(searchSource.isActive).to.be.true;
    });

    describe('activate/deactivate', () => {
      it('activates source and triggers search if query exists', async () => {
        searchSource.state.next({ searchQuery: 'test', isActive: false });
        const searchSpy = sinon.spy(searchSource, 'search');
        
        searchSource.activate();
        
        expect(searchSource.isActive).to.be.true;
        sinon.assert.calledOnce(searchSpy);
      });

      it('deactivates source', () => {
        searchSource.state.next({ isActive: true });
        searchSource.deactivate();
        expect(searchSource.isActive).to.be.false;
      });
    });

    describe('executeQuery', () => {
      it('does not update the state neither execute the query if deactivated', async () => {
        await searchSource.executeQuery('new query');
        expect(searchSource.searchQuery).to.equal('');
        expect(searchSource.isLoading).to.be.false;
        expect(searchSource.isActive).to.be.false;
        expect(searchSource.items).to.be.undefined;
      });

      it('resets state for new search query', async () => {
        searchSource.activate();
        await searchSource.executeQuery('new query');
        expect(searchSource.searchQuery).to.equal('new query');
        expect(searchSource.items).to.be.eql(items);
      });

      it('appends items for pagination', async () => {
        const existingItems = ['item1'];
        searchSource.state.partialNext({
          items: existingItems,
          isActive: true,
          searchQuery: 'test'
        });
        
        sinon.stub(searchSource, 'query').resolves({ 
          items: ['item2'],
          next: null 
        });

        await searchSource.executeQuery();
        expect(searchSource.items).to.deep.equal(['item1', 'item2']);
      });
    });

    describe('search debounce', () => {
      const defaultDebounceTimeMs = 300;
      let executeQueryStub;

      beforeEach(() => {
        // Stub executeQuery on the prototype before creating the instance to avoid effect of binding in constructor
        executeQueryStub = sinon.stub(BaseSearchSource.prototype, 'executeQuery').resolves({
          items,
          next: null
        });

        searchSource = new TestSearchSource();
      })

      afterEach(() => {
        executeQueryStub?.restore();
      })

      it('performs the debounced search execution', async () => {
        const clock = sinon.useFakeTimers();
        searchSource.activate();

        searchSource.search('new query');

        clock.tick(defaultDebounceTimeMs);

        sinon.assert.calledOnce(executeQueryStub);
        sinon.assert.calledWith(executeQueryStub, 'new query');

        clock.restore();
      });

      it('debounces multiple search calls', () => {
        const clock = sinon.useFakeTimers({ shouldAdvanceTime: true });
        searchSource.activate();

        searchSource.search('query 1');

        clock.tick(100);
        sinon.assert.notCalled(executeQueryStub);

        searchSource.search('query 2');
        clock.tick(200);
        sinon.assert.notCalled(executeQueryStub);


        searchSource.search('query 3');
        clock.tick(300);
        sinon.assert.calledOnce(executeQueryStub);
        sinon.assert.calledWith(executeQueryStub, 'query 3');

        clock.restore();
      });

      it('overrides the default debounce interval', () => {
        const clock = sinon.useFakeTimers({ shouldAdvanceTime: true });
        searchSource.activate();
        searchSource.setDebounceOptions({debounceMs: 400});

        searchSource.search('query 1');

        clock.tick(300);
        sinon.assert.notCalled(executeQueryStub);


        searchSource.search('query 2');
        clock.tick(400);
        sinon.assert.calledOnce(executeQueryStub);
        sinon.assert.calledWith(executeQueryStub, 'query 2');

        clock.restore();
      });
    });
  });

  describe('UserSearchSource', () => {
    let userSource;

    beforeEach(() => {
      userSource = new UserSearchSource(mockClient);
    });

    it('filters out current user from results', async () => {
      const users = [
        { id: 'current-user' },
        { id: 'other-user' }
      ];
      mockClient.queryUsers.resolves({ users });
      userSource.activate();
      await userSource.executeQuery('test');
      expect(userSource.items).to.have.lengthOf(1);
      expect(userSource.items[0].id).to.equal('other-user');
    });

    it('constructs correct query filters', async () => {
      userSource.activate();
      await userSource.executeQuery('test');
      
      sinon.assert.calledWith(
        mockClient.queryUsers,
        {
          $or: [
            { id: { $autocomplete: 'test' } },
            { name: { $autocomplete: 'test' } }
          ]
        },
        { id: 1 },
        { limit: 10, offset: 0 }
      );
    });
  });

  describe('ChannelSearchSource', () => {
    let channelSource;

    beforeEach(() => {
      channelSource = new ChannelSearchSource(mockClient);
    });

    it('constructs correct query filters', async () => {
      channelSource.activate();
      await channelSource.executeQuery('test');
      
      sinon.assert.calledWith(
        mockClient.queryChannels,
        {
          members: { $in: ['current-user'] },
          name: { $autocomplete: 'test' }
        },
        {},
        { limit: 10, offset: 0 }
      );
    });
  });

  describe('MessageSearchSource', () => {
    let messageSource;

    beforeEach(() => {
      messageSource = new MessageSearchSource(mockClient);
    });

    it('returns empty results if no user ID', async () => {
      mockClient.userID = null;
      messageSource.activate();
      await messageSource.executeQuery('test');
      expect(messageSource.items).to.be.empty;
    });

    it('queries messages with correct filters', async () => {
      messageSource.activate();
      await messageSource.executeQuery('test');
      
      sinon.assert.calledWith(
        mockClient.search,
        { members: { $in: ['current-user'] } },
        { text: 'test', type: 'regular' },
        { limit: 10, next: undefined, sort: { created_at: -1 } }
      );
    });

    it('loads missing channels', async () => {
      mockClient.search.resolves({
        results: [{ message: { cid: 'missing-channel' } }],
        next: null
      });
      messageSource.activate();

      await messageSource.executeQuery('test');
      
      sinon.assert.calledWith(
        mockClient.queryChannels,
        { cid: { $in: ['missing-channel'] } },
        { last_message_at: -1 }
      );
    });

    it('skips channel loading if all channels are loaded', async () => {
      mockClient.activeChannels = { 'channel-1': {} };
      messageSource.activate();
      mockClient.search.resolves({
        results: [{ message: { cid: 'channel-1' } }],
        next: null
      });

      await messageSource.executeQuery('test');
      
      sinon.assert.notCalled(mockClient.queryChannels);
    });
  });
});