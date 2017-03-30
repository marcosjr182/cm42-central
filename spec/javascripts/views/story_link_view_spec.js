var StoryLinkView = require('views/story_link_view');

describe('StoryLinkView', function() {

  beforeEach(function() {
    StoryLinkView.prototype.noteTemplate = sinon.stub();
    StoryLinkView.prototype.hoverBox = sinon.stub();

    var Story = Backbone.Model.extend({
      description: '',
      name: 'story',
      url: '/foo'
    });

    this.story = new Story({id: 2, title: 'StoryTitle', description: ''});
    this.view = new StoryLinkView({model: this.story});
  });

  it("has StoryLink as class", function() {
    expect(this.view.$el).toHaveClass('StoryLink');
  });

  it("has a data-original-title attribute", function() {
    expect(this.view.$el.data('original-title')).toBe(this.story.get('title'));
  });

  describe("StoryLink__icon", function() {

    it("should not exist when story's state is unscheduled", function() {
      this.story.set({state: 'unscheduled'});
      expect(this.view.$('.StoryLink__icon').length).toBe(0);
    });

    describe("when state is delivered", function() {

      it("should have two icons", function(){
        this.story.set({state: 'delivered'});
        expect(this.view.$('.StoryLink__icon').length).toBe(2);
      });

    });

    describe("is a material icon", function() {

      it("when state is accepted", function(){
        this.story.set({state: 'accepted'});
        expect( this.view.$('.StoryLink__icon')).toHaveClass('mi');
      });

      it("when state is rejected", function(){
        this.story.set({state: 'rejected'});
        expect(this.view.$('.StoryLink__icon')).toHaveClass('mi');
      });

    });

  });

});
