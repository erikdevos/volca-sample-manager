import React, { useMemo, useState } from 'react';
import { Button, Dropdown, Form, Modal } from 'react-bootstrap';

import CapacityMeter from './CapacityMeter.js';
import VolcaTransferControl from '../VolcaTransferControl.js';
import VolcaEraseSlotsModals from '../VolcaEraseSlotsModals.js';
import { SampleContainer } from '../store.js';
import { VOLCA_MEMORY_SECONDS, VOLCA_SLOT_COUNT } from '../setStore.js';

import classes from './TopBar.module.scss';

/** @typedef {import('../sampleCacheStore.js').SampleCache} SampleCache */
/** @typedef {import('../useVolcaSets.js').VolcaSetsApi} VolcaSetsApi */

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
   *   onAboutClick: () => void;
   * }} props
   */
  function TopBar({ volcaSets, sampleCaches, seconds, onAboutClick }) {
    const {
      sets,
      activeSet,
      activeSetSamples,
      selectSet,
      newSet,
      renameSet,
      removeSet,
    } = volcaSets;

    const isOverSlots = activeSetSamples.length > VOLCA_SLOT_COUNT;
    const isOverMemory = seconds > VOLCA_MEMORY_SECONDS;
    const canTransfer =
      activeSetSamples.length > 0 && !isOverSlots && !isOverMemory;

    // The position in the set is the slot number on the volca
    const transferSamples = useMemo(
      () =>
        activeSetSamples.map(
          (sample, slotNumber) =>
            new SampleContainer({
              ...sample.metadata,
              id: sample.id,
              slotNumber,
            })
        ),
      [activeSetSamples]
    );

    // Preparing the transfer audio takes some work, so we only mount the
    // transfer control once it's requested, for the set as it is then.
    const setKey = activeSetSamples.map((s) => s.id).join(',');
    const [transferRequestKey, setTransferRequestKey] = useState(
      /** @type {string | null} */ (null)
    );

    const [isEraseInfoOpen, setIsEraseInfoOpen] = useState(false);
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
        onClick={
          transferRequestKey === setKey
            ? undefined
            : () => setTransferRequestKey(setKey)
        }
      >
        Transfer to volca
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

        <div className={classes.actions}>
          <Button
            type="button"
            variant="outline-light"
            className={classes.clearButton}
            onClick={() => setIsEraseInfoOpen(true)}
          >
            Clear volca
          </Button>
          {transferRequestKey === setKey ? (
            <VolcaTransferControl
              samples={transferSamples}
              sampleCaches={sampleCaches}
              justTheButton
              showInfoBeforeTransfer
              initiallyOpen
              button={transferButton}
            />
          ) : (
            transferButton
          )}
        </div>

        <VolcaEraseSlotsModals
          isInfoBeforeEraseModalOpen={isEraseInfoOpen}
          setIsInfoBeforeEraseModalOpen={setIsEraseInfoOpen}
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
