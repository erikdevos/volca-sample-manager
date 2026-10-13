import React, { useCallback, useMemo, useState } from 'react';
import { Button, Dropdown, Form, Modal } from 'react-bootstrap';

import CapacityMeter from './CapacityMeter.js';
import VolcaEraseSlotsModals from '../VolcaEraseSlotsModals.js';
import AllDataTransferModal from './AllDataTransferModal.js';
import SetTransferModal from './SetTransferModal.js';
import { VOLCA_MEMORY_SECONDS, VOLCA_SLOT_COUNT } from '../setStore.js';

import classes from './TopBar.module.scss';

/** @typedef {import('../sampleCacheStore.js').SampleCache} SampleCache */
/** @typedef {import('../useVolcaSets.js').VolcaSetsApi} VolcaSetsApi */
/** @typedef {import('../useDeviceState.js').DeviceStateApi} DeviceStateApi */
/** @typedef {import('../store').SampleContainer} SampleContainer */

/**
 * What the volca has compared to the set, in a few words.
 *
 * @param {import('../utils/deviceDiff.js').DeviceDiff} diff
 * @param {number} setSize
 */
function getSyncSummary(diff, setSize) {
  const changes = diff.toSend.length + diff.toErase.length;
  if (diff.inSync) {
    return { level: 'ok', text: setSize ? 'In sync with this set' : 'Empty' };
  }
  if (!diff.isKnown && !diff.unchanged) {
    return { level: 'unknown', text: 'Unknown, not synced yet' };
  }
  const parts = [];
  if (diff.toSend.length) parts.push(`${diff.toSend.length} to send`);
  if (diff.toErase.length) parts.push(`${diff.toErase.length} to erase`);
  return {
    level: 'changes',
    text: parts.join(' · ') || `${changes} changes`,
  };
}

/**
 * @param {{
 *   title: string;
 *   initialName: string;
 *   show: boolean;
 *   onHide: () => void;
 *   onSave: (name: string) => void;
 * }} props
 */
function SetNameModal({ title, initialName, show, onHide, onSave }) {
  const [name, setName] = useState(initialName);
  return (
    <Modal show={show} onHide={onHide} onShow={() => setName(initialName)}>
      <Form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) {
            onSave(name.trim());
            onHide();
          }
        }}
      >
        <Modal.Header closeButton>
          <Modal.Title>{title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Control
            autoFocus
            value={name}
            placeholder="e.g. Techno live set"
            onChange={(e) => setName(e.target.value)}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" onClick={onHide}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Save
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

const TopBar = React.memo(
  /**
   * @param {{
   *   volcaSets: VolcaSetsApi;
   *   sampleCaches: Map<string, SampleCache>;
   *   seconds: number;
   *   factorySamples: SampleContainer[];
   *   deviceState: DeviceStateApi;
   *   onAboutClick: () => void;
   * }} props
   */
  function TopBar({
    volcaSets,
    sampleCaches,
    seconds,
    factorySamples,
    deviceState,
    onAboutClick,
  }) {
    const {
      sets,
      activeSet,
      activeSetSamples,
      activeSetSlots,
      selectSet,
      newSet,
      renameSet,
      removeSet,
    } = volcaSets;

    const isOverSlots = activeSetSlots.length > VOLCA_SLOT_COUNT;
    const isOverMemory = seconds > VOLCA_MEMORY_SECONDS;
    const canTransfer =
      activeSetSamples.length > 0 && !isOverSlots && !isOverMemory;

    const factorySampleIds = useMemo(
      () => factorySamples.map((s) => s.id),
      [factorySamples]
    );

    const {
      diff,
      recordTransfer,
      recordEraseAll,
      recordFactory,
      recordErase,
      markUnknown,
    } = deviceState;
    const [confirmAlreadyOnVolca, setConfirmAlreadyOnVolca] = useState(false);
    const sync = getSyncSummary(diff, activeSetSamples.length);
    const changeCount = diff.toSend.length + diff.toErase.length;
    const [isTransferOpen, setIsTransferOpen] = useState(false);

    const handleAllDataComplete = useCallback(
      /** @param {import('./AllDataTransferModal.js').AllDataAction} action */
      (action) => {
        if (action === 'eraseAll') recordEraseAll();
        else recordFactory(factorySamples);
      },
      [recordEraseAll, recordFactory, factorySamples]
    );
    const handleAllDataInterrupted = useCallback(
      () => markUnknown(),
      [markUnknown]
    );

    const [isEraseInfoOpen, setIsEraseInfoOpen] = useState(false);
    const [allDataAction, setAllDataAction] = useState(
      /** @type {import('./AllDataTransferModal.js').AllDataAction | null} */ (
        null
      )
    );
    const [nameModal, setNameModal] = useState(
      /** @type {'new' | 'rename' | null} */ (null)
    );
    const [confirmDeleteSet, setConfirmDeleteSet] = useState(false);

    const transferButton = (
      <Button
        type="button"
        className={classes.transferButton}
        disabled={!canTransfer}
        title={
          isOverSlots
            ? `The volca sample has ${VOLCA_SLOT_COUNT} slots`
            : isOverMemory
            ? 'This set needs more memory than the volca sample has'
            : undefined
        }
        onClick={() => setIsTransferOpen(true)}
      >
        {!canTransfer || (!diff.isKnown && !diff.unchanged)
          ? 'Transfer to volca'
          : diff.inSync
          ? 'Transfer again'
          : `Transfer changes (${changeCount})`}
      </Button>
    );

    return (
      <header className={classes.topBar}>
        <div className={classes.brand} onClick={onAboutClick} title="About">
          <span className={classes.logo} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className={classes.brandText}>
            <strong>Volca Sample</strong>
            <span>Manager</span>
          </span>
        </div>

        <div className={classes.setPicker}>
          <label htmlFor="active-set" className={classes.pickerLabel}>
            Set
          </label>
          <div className={classes.pickerRow}>
            <Form.Select
              id="active-set"
              size="sm"
              className={classes.setSelect}
              value={activeSet ? activeSet.id : ''}
              onChange={(e) => selectSet(e.target.value)}
            >
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Form.Select>
            <Dropdown align="end">
              <Dropdown.Toggle
                size="sm"
                variant="dark"
                className={classes.setMenuToggle}
                aria-label="Set options"
              >
                •••
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item onClick={() => setNameModal('new')}>
                  New set
                </Dropdown.Item>
                <Dropdown.Item onClick={() => setNameModal('rename')}>
                  Rename set
                </Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item onClick={() => setConfirmDeleteSet(true)}>
                  Delete set
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </div>
        </div>

        <CapacityMeter slotsUsed={activeSetSamples.length} seconds={seconds} />

        <div
          className={`${classes.sync} ${classes[sync.level]}`}
          title={
            diff.isKnown
              ? 'What this app has sent to your volca, compared to this set'
              : "The app doesn't know (for all slots) what's on your volca. Transfer the set once to sync."
          }
        >
          <span className={classes.pickerLabel}>Volca</span>
          <span className={classes.syncText}>
            <i aria-hidden="true" />
            {sync.text}
          </span>
        </div>

        <div className={classes.actions}>
          <Dropdown>
            <Dropdown.Toggle
              variant="outline-light"
              className={classes.clearButton}
            >
              Volca
            </Dropdown.Toggle>
            <Dropdown.Menu>
              <Dropdown.Header>On your volca sample</Dropdown.Header>
              <Dropdown.Item onClick={() => setAllDataAction('eraseAll')}>
                Erase all samples...
              </Dropdown.Item>
              <Dropdown.Item onClick={() => setIsEraseInfoOpen(true)}>
                Erase specific slots...
              </Dropdown.Item>
              <Dropdown.Item onClick={() => setAllDataAction('restoreFactory')}>
                Restore factory samples...
              </Dropdown.Item>
              <Dropdown.Divider />
              <Dropdown.Header>What the app knows</Dropdown.Header>
              <Dropdown.Item
                disabled={!activeSetSamples.length || isOverSlots}
                onClick={() => setConfirmAlreadyOnVolca(true)}
              >
                This set is already on my volca...
              </Dropdown.Item>
              <Dropdown.Item onClick={() => markUnknown()}>
                Forget what's on the volca
              </Dropdown.Item>
              <Dropdown.Divider />
              <Dropdown.Header>In this app</Dropdown.Header>
              <Dropdown.Item
                disabled={!factorySampleIds.length}
                onClick={() => newSet('Factory set', factorySampleIds)}
              >
                New set from the factory samples
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
          {transferButton}
        </div>

        <SetTransferModal
          show={isTransferOpen}
          onHide={() => setIsTransferOpen(false)}
          samples={activeSetSlots}
          sampleCaches={sampleCaches}
          deviceState={deviceState}
        />
        <AllDataTransferModal
          action={allDataAction}
          onHide={() => setAllDataAction(null)}
          onComplete={handleAllDataComplete}
          onInterrupted={handleAllDataInterrupted}
        />
        <VolcaEraseSlotsModals
          isInfoBeforeEraseModalOpen={isEraseInfoOpen}
          setIsInfoBeforeEraseModalOpen={setIsEraseInfoOpen}
          onEraseComplete={recordErase}
        />
        <SetNameModal
          title={nameModal === 'new' ? 'New set' : 'Rename set'}
          initialName={
            nameModal === 'rename' && activeSet ? activeSet.name : ''
          }
          show={nameModal !== null}
          onHide={() => setNameModal(null)}
          onSave={nameModal === 'new' ? newSet : renameSet}
        />
        <Modal
          show={confirmAlreadyOnVolca}
          onHide={() => setConfirmAlreadyOnVolca(false)}
        >
          <Modal.Header closeButton>
            <Modal.Title>This set is already on my volca</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p>
              Use this if you transferred <strong>exactly this set</strong>{' '}
              earlier (with the same order and edits), and the other slots on
              your volca are empty.
            </p>
            <p className="mb-0">
              From then on, a transfer only sends what you change. If you're not
              sure, transfer the whole set once instead.
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="light"
              onClick={() => setConfirmAlreadyOnVolca(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                recordTransfer({
                  sent: activeSetSamples.map((sample) => {
                    const slotNumber = activeSetSlots.indexOf(sample);
                    return {
                      slotNumber,
                      id: sample.id,
                      metadata: sample.metadata,
                    };
                  }),
                  erased: Array.from(
                    { length: VOLCA_SLOT_COUNT },
                    (_, slot) => slot
                  ).filter((slot) => !activeSetSlots[slot]),
                });
                setConfirmAlreadyOnVolca(false);
              }}
            >
              Yes, it's on my volca
            </Button>
          </Modal.Footer>
        </Modal>
        <Modal
          show={confirmDeleteSet}
          onHide={() => setConfirmDeleteSet(false)}
        >
          <Modal.Header closeButton>
            <Modal.Title>Delete set</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            Delete <strong>{activeSet && activeSet.name}</strong>? The samples
            stay in your collection.
          </Modal.Body>
          <Modal.Footer>
            <Button variant="light" onClick={() => setConfirmDeleteSet(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                removeSet();
                setConfirmDeleteSet(false);
              }}
            >
              Delete set
            </Button>
          </Modal.Footer>
        </Modal>
      </header>
    );
  }
);

export default TopBar;
