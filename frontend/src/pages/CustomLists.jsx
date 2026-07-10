import React, { useState, useEffect } from 'react';
import * as api from '../api';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import ConfirmationModal from '../components/common/ConfirmationModal';

export default function CustomLists({
  customLists = [],
  customListsLoading = false,
  onLoadCustomLists,
  onStartRevision,
  onOpenProblem
}) {
  const [selectedCustomListId, setSelectedCustomListId] = useState(null);
  const [customListDetail, setCustomListDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  
  // Track selected list ID in a ref to drop slow stale responses and prevent race conditions.
  const currentSelectedIdRef = React.useRef(selectedCustomListId);
  useEffect(() => {
    currentSelectedIdRef.current = selectedCustomListId;
  }, [selectedCustomListId]);
  
  // Custom List creation & editing
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDesc, setNewListDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Deletion modals
  const [customListToDelete, setCustomListToDelete] = useState(null);

  // Fetch custom list details
  const fetchCustomListDetail = async (id) => {
    setLoadingDetail(true);
    try {
      const data = await api.getCustomList(id);
      if (id !== currentSelectedIdRef.current) return;
      setCustomListDetail(data);
      setEditName(data.name);
      setEditDesc(data.description || '');
    } catch (err) {
      if (id !== currentSelectedIdRef.current) return;
      alert(err.message || 'Failed to load list details');
      setSelectedCustomListId(null);
    } finally {
      if (id === currentSelectedIdRef.current) {
        setLoadingDetail(false);
      }
    }
  };

  useEffect(() => {
    if (selectedCustomListId) {
      fetchCustomListDetail(selectedCustomListId);
    } else {
      setCustomListDetail(null);
      setIsEditing(false);
    }
  }, [selectedCustomListId]);

  const handleCreateCustomList = async (e) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    setIsCreating(true);
    try {
      const newList = await api.createCustomList({
        name: newListName.trim(),
        description: newListDesc.trim() || null
      });
      setNewListName('');
      setNewListDesc('');
      setShowCreateForm(false);
      if (onLoadCustomLists) await onLoadCustomLists();
      // Auto open detail view of the new list
      setSelectedCustomListId(newList.id);
    } catch (err) {
      alert(err.message || 'Failed to create list');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveCustomListEdit = async () => {
    if (!editName.trim()) return;
    setIsSavingEdit(true);
    try {
      const updated = await api.updateCustomList(customListDetail.id, {
        name: editName.trim(),
        description: editDesc.trim() || null
      });
      setCustomListDetail(prev => ({
        ...prev,
        name: updated.name,
        description: updated.description
      }));
      setIsEditing(false);
      if (onLoadCustomLists) onLoadCustomLists();
    } catch (err) {
      alert(err.message || 'Failed to save changes');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteCustomList = async () => {
    if (!customListToDelete) return;
    try {
      await api.deleteCustomList(customListToDelete.id);
      setCustomListToDelete(null);
      if (selectedCustomListId === customListToDelete.id) {
        setSelectedCustomListId(null);
      }
      if (onLoadCustomLists) onLoadCustomLists();
    } catch (err) {
      alert(err.message || 'Failed to delete list');
    }
  };

  const handleRemoveProblem = async (problemId) => {
    if (!confirm('Remove this problem from the list?')) return;
    try {
      await api.removeProblemFromCustomList(customListDetail.id, problemId);
      // Refresh details
      fetchCustomListDetail(customListDetail.id);
      if (onLoadCustomLists) onLoadCustomLists();
    } catch (err) {
      alert(err.message || 'Failed to remove problem');
    }
  };

  // Render detail view
  if (selectedCustomListId) {
    return (
      <div className="w-full h-full overflow-y-auto custom-scrollbar">
        <div className="max-w-[1140px] mx-auto px-sp-30 pt-sp-26 pb-10 flex flex-col gap-5">
          {/* Back Navigation */}
          <div className="text-left">
            <button
              onClick={() => setSelectedCustomListId(null)}
              className="flex items-center gap-1.5 text-fs-12 font-mono text-text-muted hover:text-accent transition-colors bg-transparent border-none cursor-pointer p-0"
            >
              ← BACK TO CUSTOM LISTS
            </button>
          </div>

          {loadingDetail || !customListDetail ? (
            <div className="py-20 text-center text-text-muted font-mono text-fs-13">
              Loading list details...
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Header Card / Edit Panel */}
              <div className="bg-bg-card border border-border-card rounded-xl p-6 text-left flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                {isEditing ? (
                  <div className="flex-1 flex flex-col gap-3 w-full">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      disabled={isSavingEdit}
                      className="text-fs-18 font-bold text-text-main bg-bg-main border border-border-main rounded px-3 py-2 outline-none w-full focus:border-accent"
                    />
                    <textarea
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      disabled={isSavingEdit}
                      placeholder="Optional list description..."
                      rows="2"
                      className="text-fs-13 text-text-hover bg-bg-main border border-border-main rounded px-3 py-2 outline-none w-full focus:border-accent custom-scrollbar resize-none"
                    />
                    <div className="flex gap-2.5 mt-1">
                      <Button size="sm" onClick={handleSaveCustomListEdit} disabled={isSavingEdit || !editName.trim()}>
                        {isSavingEdit ? 'Saving...' : 'Save'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} disabled={isSavingEdit}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h1 className="text-fs-21 font-bold text-text-main tracking-[-0.015em] m-0">
                        {customListDetail.name}
                      </h1>
                      <button
                        onClick={() => setIsEditing(true)}
                        className="bg-transparent border-none text-text-muted hover:text-accent font-mono text-fs-10.5 cursor-pointer"
                      >
                        [EDIT]
                      </button>
                    </div>
                    <p className="text-fs-13 text-text-muted mt-2 m-0 max-w-[700px] leading-relaxed">
                      {customListDetail.description || 'No description provided.'}
                    </p>
                    <div className="font-mono text-fs-11 text-text-muted/60 mt-3">
                      Created: {new Date(customListDetail.createdAt).toLocaleDateString()} · {customListDetail.problems?.length || 0} problems
                    </div>
                  </div>
                )}

                {!isEditing && customListDetail.problems && customListDetail.problems.length > 0 && (
                  <div className="flex gap-2.5 self-stretch md:self-auto justify-end">
                    <Button
                      variant="primary"
                      onClick={() => onStartRevision(customListDetail.problems)}
                    >
                      <span className="mr-1">⚡</span> Revise list
                    </Button>
                  </div>
                )}
              </div>

              {/* Problems Table */}
              <div className="flex flex-col">
                <h2 className="text-fs-14 font-semibold text-text-main font-mono tracking-wide text-left mb-3.5 uppercase">
                  Problems in List
                </h2>

                <div className="bg-bg-card border border-border-card rounded-xl overflow-hidden flex flex-col">
                  {/* Header */}
                  <div className="grid grid-cols-[50px_2.5fr_1fr_1fr_1fr_120px] gap-3 px-sp-18 py-sp-11 border-b border-border-muted font-mono text-fs-9-5 text-border-accent tracking-[0.06em] text-left">
                    <span>#</span>
                    <span>TITLE</span>
                    <span>TOPIC</span>
                    <span>DIFFICULTY</span>
                    <span>STATUS</span>
                    <span className="text-right">ACTION</span>
                  </div>

                  {/* Body */}
                  {customListDetail.problems.length === 0 ? (
                    <div className="py-16 text-text-muted text-fs-13 text-center">
                      No problems in this list yet. Add them from the LeetCode Library or the Problem Bank!
                    </div>
                  ) : (
                    customListDetail.problems.map((p, idx) => (
                      <div
                        key={p.id}
                        onClick={() => onOpenProblem(p.id)}
                        className="grid grid-cols-[50px_2.5fr_1fr_1fr_1fr_120px] gap-3 items-center px-sp-18 py-3 cursor-pointer text-left hover:bg-bg-element-hover border-b border-bg-element-dark last:border-b-0 transition-colors duration-150"
                      >
                        <span className="font-mono text-fs-12 text-text-muted">
                          {idx + 1}.
                        </span>
                        <span className="text-fs-13.5 text-text-main font-medium truncate">
                          {p.title}
                        </span>
                        <span className="text-fs-13 text-text-hover truncate">
                          {p.topic}
                        </span>
                        <div>
                          <Badge type="difficulty" value={p.difficulty} />
                        </div>
                        <div>
                          <Badge type="status" value={p.status} />
                        </div>
                        <div className="text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleRemoveProblem(p.id)}
                            className="bg-transparent border-none text-red-400 hover:text-red-300 font-mono text-fs-11 cursor-pointer transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render Lists Grid View
  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[1140px] mx-auto px-sp-30 pt-sp-26 pb-10 flex flex-col gap-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-fs-21 font-bold text-text-main tracking-[-0.015em] m-0">
              Custom Lists
            </h1>
            <p className="font-mono text-fs-12 text-text-muted mt-1 m-0">
              {customLists.length} custom lists · group and filter your problems
            </p>
          </div>

          <Button onClick={() => setShowCreateForm(prev => !prev)}>
            {showCreateForm ? 'Cancel' : '+ Create List'}
          </Button>
        </div>

        {/* Create list collapsible panel */}
        {showCreateForm && (
          <form
            onSubmit={handleCreateCustomList}
            className="bg-bg-card border border-border-card rounded-xl p-5 flex flex-col gap-4 text-left animate-slide-down"
          >
            <div className="text-fs-14 font-semibold text-text-main font-mono tracking-wide uppercase">
              New List details
            </div>
            
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="font-mono text-[10px] text-border-accent">LIST NAME</label>
                <input
                  type="text"
                  placeholder="E.g., NeetCode 150, Arrays Study List..."
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  disabled={isCreating}
                  required
                  className="text-fs-13 text-text-main bg-bg-main border border-border-main rounded px-3 py-2 outline-none focus:border-accent"
                />
              </div>
              
              <div className="flex-[2] flex flex-col gap-1.5">
                <label className="font-mono text-[10px] text-border-accent">DESCRIPTION (OPTIONAL)</label>
                <input
                  type="text"
                  placeholder="Describe the focus of this list..."
                  value={newListDesc}
                  onChange={(e) => setNewListDesc(e.target.value)}
                  disabled={isCreating}
                  className="text-fs-13 text-text-main bg-bg-main border border-border-main rounded px-3 py-2 outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 mt-2">
              <Button type="submit" disabled={isCreating || !newListName.trim()}>
                {isCreating ? 'Creating...' : 'Create List'}
              </Button>
            </div>
          </form>
        )}

        {/* Custom Lists Grid */}
        {customListsLoading && customLists.length === 0 ? (
          <div className="py-20 text-center text-text-muted font-mono text-fs-13">
            Loading custom lists...
          </div>
        ) : customLists.length === 0 ? (
          <div className="bg-bg-card border border-border-card rounded-xl py-24 text-center text-text-muted flex flex-col items-center justify-center gap-3">
            <svg width="40" height="40" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted/40">
              <path d="M2 13.5V4a1.5 1.5 0 0 1 1.5-1.5h4.5a1.5 1.5 0 0 1 1.25.75L10.5 5h6A1.5 1.5 0 0 1 18 6.5v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 13.5z"/>
            </svg>
            <div className="text-fs-14 font-semibold text-text-main">No custom lists created yet</div>
            <div className="text-fs-12 text-text-muted max-w-[340px] leading-relaxed">
              Create a custom list to group and practice specific sets of problems from your problem bank.
            </div>
            <Button size="sm" onClick={() => setShowCreateForm(true)} className="mt-2">
              Create your first list
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {customLists.map((list) => (
              <div
                key={list.id}
                onClick={() => setSelectedCustomListId(list.id)}
                className="bg-bg-card border border-border-card rounded-xl p-5 text-left flex flex-col justify-between min-h-[160px] cursor-pointer hover:border-accent/40 hover:bg-bg-element-hover/20 transition-all duration-200 shadow-sm relative group"
              >
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="text-fs-16 font-bold text-text-main tracking-tight mt-0 mb-1.5 truncate flex-1 group-hover:text-accent transition-colors">
                      {list.name}
                    </h3>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCustomListToDelete(list);
                      }}
                      className="opacity-0 group-hover:opacity-100 bg-transparent border-none text-text-muted hover:text-red-400 font-mono text-fs-11 cursor-pointer transition-opacity p-1"
                      title="Delete list"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-fs-12.5 text-text-muted leading-relaxed line-clamp-2 mt-0">
                    {list.description || 'No description provided.'}
                  </p>
                </div>

                <div className="flex justify-between items-center border-t border-border-subtle/50 pt-3.5 mt-4">
                  <span className="font-mono text-[10px] text-border-accent tracking-wider uppercase font-semibold">
                    {list.problemCount} {list.problemCount === 1 ? 'problem' : 'problems'}
                  </span>
                  
                  <span className="text-fs-11 text-accent font-medium flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                    View Problems →
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* List Deletion Confirmation */}
        <ConfirmationModal
          isOpen={!!customListToDelete}
          title="Delete Custom List"
          message={`Are you sure you want to delete the list "${customListToDelete?.name}"? This list will be deleted permanently, but the problems inside will remain in your Problem Bank.`}
          confirmLabel="Delete List"
          confirmVariant="red"
          onConfirm={handleDeleteCustomList}
          onCancel={() => setCustomListToDelete(null)}
        />
      </div>
    </div>
  );
}
