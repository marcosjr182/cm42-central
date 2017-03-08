module.exports = Backbone.View.extend({
  template: require('../templates/column.ejs'),
  activityTemplate: require('../templates/activity.ejs'),

  initialize: function() {
    _.bindAll(this, 'addActivities');

    this.$el.html(this.template({id: 'history', name: I18n.t('projects.show.history')}));
    this.$header = this.$el.parent().find('.toggle-title');
  },

  addActivities: function(activities) {
    _.each(activities.models, function(item) {
      this.addActivity(item.attributes);
    }, this);

    this.$el.parent().show();
  },

  addActivity: function(activity) {
    this.$el.append(this.activityTemplate({
      action: activity.action,
      changes: activity.subject_changes,
      date: activity.date,
      user: this.options.users.get(activity.user_id).attributes.name
    }));
  },

  setColumnTitle: function(name) {
    if (name.length > 32) name = name.substring(0, 32) + '...';
    this.$header.text("History Of '" + name + "'");
  },

  setStory: function(story) {
    this.$el.html('');
    this.setColumnTitle(story.attributes.title);

    story.history.fetch({success: this.addActivities});
  }
});
