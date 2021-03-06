import React from 'react';
import ReactDOM from 'react-dom';
import StoryControls from 'components/story/StoryControls';
import StoryDescription from 'components/story/StoryDescription';
import StoryHistoryLocation from 'components/story/StoryHistoryLocation';
import StorySelect from 'components/story/StorySelect';
import StoryDatePicker from 'components/story/StoryDatePicker';

var Clipboard = require('clipboard');

var executeAttachinary = require('libs/execute_attachinary');

var FormView = require('./form_view');
var EpicView = require('./epic_view');
var NoteForm = require('./note_form');
var NoteView = require('./note_view');
var TaskForm = require('./task_form');
var TaskView = require('./task_view');

const LOCAL_STORY_REGEXP = /(?!\s|\b)(#\d+)(?!\w)/g;

module.exports = FormView.extend({

  template: require('templates/story.ejs'),
  alert: require('templates/alert.ejs'),

  tagName: 'div',
  linkedStories: {},

  initialize: function(options) {
    _.extend(this, _.pick(options, "isSearchResult"));

    _.bindAll(this, "render", "highlight", "moveColumn", "setClassName",
      "transition", "estimate", "disableForm", "renderNotes",
      "renderNotesCollection", "addEmptyNote", "hoverBox",
      "renderTasks", "renderTasksCollection", "addEmptyTask",
      "clickSave", "attachmentDone", "attachmentStart",
      "attachmentFail", "toggleControlButtons");

    // Rerender on any relevant change to the views story
    this.model.on("change", this.render);

    this.model.on("change:title", this.highlight);
    this.model.on("change:description", this.highlight);
    this.model.on("change:column", this.highlight);
    this.model.on("change:state", this.highlight);
    this.model.on("change:position", this.highlight);
    this.model.on("change:estimate", this.highlight);
    this.model.on("change:story_type", this.highlight);

    this.model.on("change:column", this.moveColumn);

    this.model.on("change:estimate", this.setClassName);
    this.model.on("change:state", this.setClassName);

    this.model.on("change:notes", this.addEmptyNote);
    this.model.on("change:notes", this.renderNotesCollection);

    this.model.on("change:tasks", this.addEmptyTask);
    this.model.on("change:tasks", this.renderTasksCollection);

    this.model.on("render", this.hoverBox);
    // Supply the model with a reference to it's own view object, so it can
    // remove itself from the page when destroy() gets called.
    this.model.views.push(this);

    if (this.model.id) {
      this.id = this.el.id = (this.isSearchResult ? 'search-result-' : '') + this.model.id;
      this.$el.attr('id', 'story-' + this.id);
      this.$el.data('story-id', this.id);
    }

    // Set up CSS classes for the view
    this.setClassName();

    // Add an empty note to the collection
    this.addEmptyNote();
    // Add an empty task to the collection
    this.addEmptyTask();
  },

  isReadonly: function() {
    return this.model.isReadonly;
  },

  events: {
    "click": "startEdit",
    "click .epic-link": "openEpic",
    "click .submit": "clickSave",
    "click .cancel": "cancelEdit",
    "click .transition": "transition",
    "click .state-actions .estimate": "estimate",
    "change select.story_type": "render",
    "click .destroy": "clear",
    "click .description": "editDescription",
    "click .edit-description": "editDescription",
    "click .toggle-history": "history",
    "sortupdate": "sortUpdate",
    "fileuploaddone": "attachmentDone",
    "fileuploadstart": "attachmentStart",
    "fileuploadfail": "attachmentFail"
  },

  // Triggered whenever a story is dropped to a new position
  sortUpdate: function(ev, ui) {

    // The target element, i.e. the StoryView.el element
    var target = $(ev.target);

    // Initially, try and get the id's of the previous and / or next stories
    // by just searching up above and below in the DOM of the column position
    // the story was dropped on.  The case where the column is empty is
    // handled below.
    var previous_story_id = target.prev('.story').data('story-id');
    var next_story_id = target.next('.story').data('story-id');

    // Set the story state if drop column is chilly_bin or backlog
    var column = target.parent().attr('id');
    if (column === 'backlog' || (column === 'in_progress' && this.model.get('state') === 'unscheduled')) {
      this.model.set({state: 'unstarted'});
    } else if (column == 'chilly_bin') {
      this.model.set({state: 'unscheduled'});
    }

    // If both of these are unset, the story has been dropped on an empty
    // column, which will be either the backlog or the chilly bin as these
    // are the only columns that can receive drops from other columns.
    if (_.isUndefined(previous_story_id) && _.isUndefined(next_story_id)) {

      var beforeSearchColumns = this.model.collection.project.columnsBefore('#' + column);
      var afterSearchColumns  = this.model.collection.project.columnsAfter('#' + column);

      var previousStory = _.last(this.model.collection.columns(beforeSearchColumns));
      var nextStory = _.first(this.model.collection.columns(afterSearchColumns));

      if (typeof previousStory != 'undefined') {
        previous_story_id = previousStory.id;
      }
      if (typeof nextStory != 'undefined') {
        next_story_id = nextStory.id;
      }
    }

    if (!_.isUndefined(previous_story_id)) {
      this.model.moveAfter(previous_story_id);
    } else if (!_.isUndefined(next_story_id)) {
      this.model.moveBefore(next_story_id);
    } else {
      // The only possible scenario that we should reach this point under
      // is if there is only one story in the collection, so there is no
      // previous or next story.  If this is not the case then something
      // has gone wrong.
      if (this.model.collection.length != 1) {
        throw "Unable to determine previous or next story id for dropped story";
      }
    }
    this.model.save();
  },

  transition: function(ev) {
    // The name of the function that needs to be called on the model is the
    // value of the form button that was clicked.
    var transitionEvent = ev.target.value;
    _.each(I18n.t('story.events'), function(value, key) {
      if( value == transitionEvent )
        transitionEvent = key;
    })

    if (transitionEvent === 'accept' || transitionEvent === 'reject') {
      var confirmed = confirm( I18n.t('story.definitive_sure', {action: transitionEvent} ));

      if (!confirmed) return;
    }

    this.saveInProgress = true;
    this.render();

    this.model[transitionEvent]({silent:true});

    var that = this;
    this.model.save(null, {
      success: function(model, response) {
        that.saveInProgress = false;
        that.render();
      },
      error: function(model, response) {
        var json = $.parseJSON(response.responseText);
        window.projectView.notice({
          title: I18n.t("save error"),
          text: model.errorMessages()
        });
        that.saveInProgress = false;
        that.render();
      }
    });
  },

  estimate: function(ev) {
    this.saveInProgress = true;
    this.render();
    this.model.set({estimate: ev.target.attributes['data-value'].value});

    var that = this;
    this.model.save(null, {
      success: function(model, response) {
        that.saveInProgress = false;
        that.render();
      },
      error: function(model, response) {
        var json = $.parseJSON(response.responseText);
        window.projectView.notice({
          title: I18n.t("save error"),
          text: model.errorMessages()
        });
        that.saveInProgress = false;
        that.render();
      }
    });
  },

  canEdit: function() {
    var isEditable              = this.model.get('editing');
    var isSearchResultContainer = this.$el.hasClass('searchResult');
    var clickFromSearchResult   = this.model.get('clickFromSearchResult');
    if (_.isUndefined(isEditable))
      isEditable = false;
    if (_.isUndefined(clickFromSearchResult))
      clickFromSearchResult = false;
    if ( clickFromSearchResult && isSearchResultContainer ) {
      return isEditable;
    } else if ( !clickFromSearchResult && !isSearchResultContainer ) {
      return isEditable;
    } else {
      return false;
    }
  },

  // Move the story to a new column
  moveColumn: function() {
    this.$el.appendTo(this.model.get('column'));
  },

  startEdit: function(e) {
    if (this.eventShouldExpandStory(e)) {
      this.model.set({editing: true, editingDescription: false, clickFromSearchResult: this.$el.hasClass('searchResult')});
      this.removeHoverbox();
    }
  },

  openEpic: function(e){
    e.stopPropagation();
    var label = $(e.target).text();
    new EpicView({model: this.model.collection.project, label: label});
  },

  // When a story is clicked, this method is used to check whether the
  // corresponding click event should expand the story into its form view.
  eventShouldExpandStory: function(e) {
    // Shouldn't expand if it's already expanded.
    if (this.canEdit()) {
      return false;
    }
    // Should expand if the click wasn't on one of the buttons.
    if ($(e.target).is('input')) return false
    if ($(e.target).is('.input')) return false
    return true;
  },

  cancelEdit: function() {
    this.model.set({editing: false});

    // If the model was edited, but the edits were deemed invalid by the
    // server, the local copy of the model will still be invalid and have
    // errors set on it after cancel.  So, reload it from the server, which
    // will return the attributes to their true state.
    if (this.model.hasErrors()) {
      this.model.unset('errors');
      this.model.fetch();
    }

    // If this is a new story and cancel is clicked, the story and view
    // should be removed.
    if (this.model.isNew()) {
      this.model.clear();
    }
  },

  saveEdit: function(event, editMode) {
    this.disableForm();

    // Call this here to ensure the story gets it's accepted_at date set
    // before the story collection callbacks are run if required.  The
    // collection callbacks need this to be set to know which iteration to
    // put an accepted story in.
    this.model.setAcceptedAt();

    var that = this;
    var documents = $(event.currentTarget).closest('.story')
      .find("[type='hidden'][name='documents[]']");

    this.model.save(null, { documents: documents,
      success: function(model, response) {
        that.enableForm();
        that.model.set({ editing: editMode });
        that.toggleControlButtons(false);
      },
      error: function(model, response) {
        var json = $.parseJSON(response.responseText);
        model.set({editing: true, errors: json.story.errors});
        window.projectView.notice({
          title: I18n.t("Save error"),
          text: model.errorMessages()
        });
        that.enableForm();
      }
    });
  },

  // Delete the story and remove it's view element
  clear: function() {
    if (confirm("Are you sure you want to destroy this story?"))
      this.model.clear();
  },

  editDescription: function(ev) {
    const $target = $(ev.target);
    if ($target.hasClass('story-link') || $target.hasClass('story-link-icon'))
      return;

    this.model.set({editingDescription: true});
    this.render();
  },

  // Visually highlight the story if an external change happens
  highlight: function() {
    if(!this.model.get('editing')) {
      // Workaround for http://bugs.jqueryui.com/ticket/5506
      if (this.$el.is(':visible')) {
        this.$el.effect("highlight", {}, 3000);
      }
    }
  },

  render: function() {
    const storyControlsContainer = this.$('[data-story-controls]').get(0);

    if (storyControlsContainer) {
      ReactDOM.unmountComponentAtNode(storyControlsContainer);
    }

    if(this.canEdit()) {

      this.$el.empty();
      this.$el.addClass('editing');

      const $storyControls = $('<div data-story-controls></div>');
      this.$el.append($storyControls);

      if (this.id != undefined) {
        const $storyHistoryLocation = $('<div data-story-history-location></div>');
        this.$el.append($storyHistoryLocation);
      }

      this.$el.append(
        this.makeFormControl(this.makeTitle())
      );

      this.$el.append(
        this.makeFormControl(function(div) {
          $(div).addClass('form-inline');

          const $storyEstimate = $('<div class="form-group" data-story-estimate></div>');
          $(div).append($storyEstimate);

          const $storyType = $('<div class="form-group" data-story-type></div>');
          $(div).append($storyType);

          const $storyState = $('<div class="form-group" data-story-state></div>');
          $(div).append($storyState);

        })
      );

      this.$el.append(
        this.makeFormControl(function(div) {
          $(div).addClass('form-inline');

          const $storyRequestedBy = $('<div class="form-group" data-requested-by></div>');
          $(div).append($storyRequestedBy);

          $(div).append(this.makeFormControl({
            name: "owned_by_id",
            label: true,
            control: this.select("owned_by_id",
              this.model.collection.project.users.forSelect(), {
                blank: '---',
                attrs: {
                  class: [],
                  disabled: this.isReadonly()
                }
            })
          }));
        })
      );

      this.$el.append(
        this.makeFormControl({
          name: "labels",
          label: true,
          control: this.textField("labels"),
          class: 'form-control',
          disabled: this.isReadonly()
        })
      );

      this.$el.append(
        this.makeFormControl(this.makeDescription())
      );

      this.renderTasks();

      this.$el.append(
        this.makeFormControl(function(div) {
          var random = (Math.floor(Math.random() * 10000) + 1);
          var progress_element_id = "documents_progress_" + random;
          var finished_element_id = "documents_finished_" + random;
          var attachinary_container_id = "attachinary_container_" + random;

          $(div).append(this.label('attachments', I18n.t('story.attachments')));
          $(div).addClass('uploads');
          if(!this.isReadonly()) {
            $(div).append(this.fileField("documents", progress_element_id, finished_element_id, attachinary_container_id));
            $(div).append("<div id='" + progress_element_id + "' class='attachinary_progress_bar'></div>");
          }
          $(div).append('<div id="' + attachinary_container_id + '"></div>');

          // FIXME: refactor to a separated AttachmentView or similar
          // must run the plugin after the element is available in the DOM, not before, hence, the setTimeout
          clearTimeout(window.executeAttachinaryTimeout);
          window.executeAttachinaryTimeout = setTimeout(executeAttachinary, 500);
        })
      );

      this.initTags();

      this.renderNotes();

      if(this.model.get('story_type') === 'release') {
        this.$el.empty();
        this.$el.append($storyControls);
        this.renderReleaseStory();
      }
      this.renderReactComponents();

    } else {
      this.$el.removeClass('editing');
      this.$el.html(this.template({story: this.model, view: this}));
    }
    this.hoverBox();
    return this;
  },

  renderReactComponents: function() {

    ReactDOM.render(
      <StoryControls
        onClickSave={this.clickSave}
        onClickDelete={this.clear}
        onClickCancel={this.cancelEdit}
      />,
      this.$('[data-story-controls]').get(0)
    );

    const historyLocationContainer = this.$('[data-story-history-location]').get(0);
    if (historyLocationContainer) {
      ReactDOM.render(
        <StoryHistoryLocation
          id={this.id}
          url={`${this.getLocation()}#story-${this.id}`}
        />,
        historyLocationContainer
      );
      new Clipboard('.btn-clipboard');
    }

    const descriptionContainer = this.$('.description-wrapper')[0];
    if (descriptionContainer) {
      ReactDOM.render(
        <StoryDescription
          linkedStories={this.linkedStories}
          isReadonly={this.isReadonly()}
          description={this.parseDescription()} />,
          descriptionContainer
        );
    }

    const $storyEstimate = this.$('[data-story-estimate]');
    if ($storyEstimate.length) {
      const storyEstimateOptions = this.model.point_values().map(this.createStoryEstimateOptions);
      ReactDOM.render(
        <StorySelect
          name='estimate'
          className='story_estimate'
          blank={I18n.t('story.no_estimate')}
          options={storyEstimateOptions}
          selected={this.model.get('estimate')}
          disabled={this.model.notEstimable() || this.isReadonly()}
        />,
        $storyEstimate.get(0)
      );

      this.bindElementToAttribute($storyEstimate.find('select[name="estimate"]'), 'estimate');
    }

    const $storyTypeSelect = this.$('[data-story-type]');
    if ($storyTypeSelect.length) {
      const typeOptions = ["feature", "chore", "bug", "release"];
      const storyTypeOptions = typeOptions.map(this.createStoryTypeOptions);
      ReactDOM.render(
        <StorySelect
          className='story_type'
          options={storyTypeOptions}
          name='story_type'
          selected={this.model.get('story_type')}
          disabled={this.isReadonly()}
        />,
        $storyTypeSelect.get(0)
      );

      this.bindElementToAttribute($storyTypeSelect.find('select[name="story_type"]'), 'story_type');
    }

    const $storyStateSelect = this.$('[data-story-state]');
    if ($storyStateSelect.length) {
      const stateOptions = ["unscheduled", "unstarted", "started", "finished", "delivered", "accepted", "rejected"];
      const storyStateOptions = stateOptions.map(this.createStoryStateOptions);
      ReactDOM.render(
        <StorySelect
          name='state'
          className='story_state'
          options={storyStateOptions}
          selected={this.model.get('state')}
          disabled={this.isReadonly()}
        />,
        $storyStateSelect.get(0)
      );

      this.bindElementToAttribute($storyStateSelect.find('select[name="state"]'), 'state');
    }

    const $storyRequestedBySelect = this.$('[data-requested-by]');
    if ($storyRequestedBySelect.length) {
      const storyRequestedByOptions = this.model.collection.project.users.forSelect();
      ReactDOM.render(
        <StorySelect
          name='requested_by'
          blank='---'
          className='requested_by_id'
          options={storyRequestedByOptions}
          selected={this.model.get('requested_by_id')}
          disabled={this.isReadonly()}
        />,
        $storyRequestedBySelect.get(0)
      );

      this.bindElementToAttribute($storyRequestedBySelect.find('select[name="requested_by"]'), 'requested_by_id');
    }
  },

  createStoryEstimateOptions: function(option) {
    return [option, option];
  },

  createStoryTypeOptions: function(option) {
    return [I18n.t('story.type.' + option), option];
  },

  createStoryStateOptions: function(option) {
    return [I18n.t('story.state.' + option), option];
  },

  makeStoryTypeSelect: function(div) {
    var storyTypeOptions = _.map(["feature", "chore", "bug", "release"], function(option) {
      return [I18n.t('story.type.' + option), option]
    });

    $(div).append(this.makeFormControl({
      name: "story_type",
      label: true,
      disabled: true,
      control: this.select("story_type", storyTypeOptions, {
        attrs: {
          class: ['story_type'],
          disabled: this.isReadonly()
        }
      })
    }));
  },

  makeDescription: function() {
    return function(div) {
      $(div).append(this.label("description", I18n.t('activerecord.attributes.story.description')));

      if(this.model.isNew() || this.model.get('editingDescription')) {
        var textarea = this.textArea("description");
        $(textarea).atwho({
          at: "@",
          data: window.projectView.usernames(),
        });
        $(div).append(textarea);
      } else {
        var $description = $('<div class="description-wrapper"><div>');
        $(div).append($description);
      }
    }
  },

  makeTitle: function() {
    return function(div) {
      $(div).append(this.label("title", I18n.t('activerecord.attributes.story.title')));
      $(div).append(this.textField("title", {
        'class' : 'title form-control input-sm',
        'placeholder': I18n.t('story title'),
        'maxlength': 255,
        'disabled': this.isReadonly()
      }));
    }
  },

  renderReleaseStory: function() {
    this.$el.append(
      this.makeFormControl(this.makeTitle())
    );

    if(this.model.get('editing')) {
      this.$el.append(
        this.makeFormControl(function(div) {
          this.makeStoryTypeSelect(div);
        }));
    }

    const $storyDate = $('<div class="form-group" data-story-datepicker></div>');
    this.$el.append($storyDate);

    ReactDOM.render(
      <StoryDatePicker
        releaseDate={this.model.get('release_date')}
        onChangeCallback={function(){$('input[name=release_date]').trigger('change')}}
      />,
      $storyDate.get(0)
    );


    const dateInput = this.$('input[name=release_date]');
    this.bindElementToAttribute(dateInput, 'release_date');

    this.$el.append(
      this.makeFormControl(this.makeDescription()));

  },

  parseDescription: function() {
    const description = window.md.makeHtml(this.model.escape('description')) || '';
    var id, story;
    return description.replace(LOCAL_STORY_REGEXP, story_id => {
      id = story_id.substring(1);
      story = this.model.collection.get(id);
      this.linkedStories[id] = story;
      return (story) ? `<a data-story-id='${id}'></a>` : story_id;
    });
  },

  setClassName: function() {
    var className = [
      'story', this.model.get('story_type'), this.model.get('state')
    ].join(' ');
    if (this.model.estimable() && !this.model.estimated()) {
      className += ' unestimated';
    }
    if (this.isSearchResult) {
      className += ' searchResult';
    }
    this.className = this.el.className = className;
    return this;
  },

  saveInProgress: false,

  disableForm: function() {
    this.$el.find('input,select,textarea').attr('disabled', 'disabled');
    this.$el.find('a.collapse,a.expand').removeClass(/icons-/).addClass('icons-throbber');
  },

  enableForm: function() {
    this.$el.find('a.collapse').removeClass(/icons-/).addClass("icons-collapse");
  },

  initTags: function() {
    var model = this.model;
    var $input = this.$el.find("input[name='labels']");
    $input.tagit({
      availableTags: model.collection.labels,
      readOnly: this.isReadonly()
    });

    // Manually bind labels for now
    $input.on('change', function(){
      var that = this;
      setTimeout(function() {
        model.set({ labels: $(that).val()});
      }, 50);
    });
  },

  renderNotes: function() {
    if (this.model.notes.length > 0) {
      var el = this.$el;
      el.append(this.label('notes', I18n.t('story.notes')));
      el.append('<div class="notelist"/>');
      this.renderNotesCollection();
    }
  },

  renderTasks: function() {
    if (this.model.tasks.length > 0) {
      var el = this.$el;
      el.append(this.label('tasks', I18n.t('story.tasks')));
      el.append('<div class="tasklist"/>');
      this.renderTasksCollection();
    }
  },

  renderNotesCollection: function() {
    var notelist = this.$('div.notelist');
    notelist.html('');
    if(!this.isReadonly())
      this.addEmptyNote();
    var that = this;
    this.model.notes.each(function(note) {
      var view;
      if (!that.isReadonly() && note.isNew()) {
        view = new NoteForm({model: note});
      } else {
        if (that.isReadonly()) note.isReadonly = true;
        view = new NoteView({model: note});
      }
      notelist.append(view.render().el);
    });
  },

  renderTasksCollection: function() {
    var tasklist = this.$('div.tasklist');
    tasklist.html('');
    if(!this.isReadonly())
      this.addEmptyTask();
    var that = this;
    this.model.tasks.each(function(task) {
      var view;
      if (!that.isReadonly() && task.isNew()) {
        view = new TaskForm({model:task});
      } else {
        if (that.isReadonly()) task.isReadonly = true;
        view = new TaskView({model:task});
      }
      tasklist.append(view.render().el);
    });
  },

  addEmptyTask: function() {
    if (this.model.isNew()) {
      return;
    }

    var task = this.model.tasks.last();
    if (task && task.isNew()) {
      return;
    }

    this.model.tasks.add({});
  },

  addEmptyNote: function() {

    // Don't add an empty note if the story is unsaved.
    if (this.model.isNew()) {
      return;
    }

    // Don't add an empty note if the notes collection already has a trailing
    // new Note.
    var last = this.model.notes.last();
    if (last && last.isNew()) {
      return;
    }

    // Add a new unsaved note to the collection.  This will be rendered
    // as a form which will allow the user to add a new note to the story.
    this.model.notes.add({});
    this.$el.find('a.collapse,a.expand').removeClass(/icons-/).addClass('icons-throbber');
  },

  // FIXME Move to separate view
  hoverBox: function() {
    if (!this.model.isNew()) {
      this.$el.find('.popover-activate').popover({
        delay: 200, // A small delay to stop the popovers triggering whenever the mouse is moving around
        html: true,
        trigger: 'hover',
        title: () => this.model.get("title"),
        content: () => require('templates/story_hover.ejs')({
          story: this.model,
          noteTemplate: require('templates/note.ejs')
        })
      });
    }
  },

  removeHoverbox: function() {
    $('.popover').remove();
  },

  setFocus: function() {
    if (this.model.get('editing') === true ) {
      this.$('input.title').first().focus();
    }
  },

  makeFormControl: function(content) {
    var div = this.make('div', {
      class: 'form-group'
    });
    if (typeof content == 'function') {
      content.call(this, div);
    } else if (typeof content == 'object') {
      var $div = $(div);
      if (content.label) {
        $div.append(this.label(content.name));
        $div.append('<br/>');
      }
      $div.append(content.control);
    }
    return div;
  },

  attachmentDone: function(event) {
    if (this.model.isNew()) {
      this.toggleControlButtons(false);
    } else {
      this.saveEdit(event, true);
    }
  },

  clickSave: function(event) {
    this.saveEdit(event, false);
  },

  attachmentStart: function() {
    this.toggleControlButtons(true);
  },

  attachmentFail: function() {
    this.toggleControlButtons(false);

    this.$('.uploads').prepend(this.alert({
      className: 'story-alert alert-danger',
      message: I18n.t('story.errors.failed_upload')
    }));
  },

  toggleControlButtons: function(isDisabled) {
    var $storyControls = this.$el.find('.story-controls');
    $storyControls.find('.submit, .destroy, .cancel').prop('disabled', isDisabled);
  },

  getLocation: function() {
    var location = window.location.href;
    var hashIndex = location.indexOf('#');
    var endIndex = hashIndex > 0 ? hashIndex : location.length;
    return location.substring(0, endIndex);
  },

  history: function(e) {
    this.model.showHistory();
  }
});
