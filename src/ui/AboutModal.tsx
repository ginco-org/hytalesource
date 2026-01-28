import { Button, Checkbox, Modal, Space } from "antd";
import { useEffect } from "react";
import { agreedEula } from "../logic/Settings";
import { InfoCircleOutlined } from '@ant-design/icons';
import { useObservable } from "../utils/UseObservable";
import { BehaviorSubject } from "rxjs";

export const aboutModalOpen = new BehaviorSubject<boolean>(false);

export const AboutModalButton = () => {
    return (
        <Button type="default" onClick={() => aboutModalOpen.next(true)}>
            <InfoCircleOutlined />
        </Button>
    );
};

const AboutModal = () => {
    const accepted = useObservable(agreedEula.observable);
    const isModalOpen = useObservable(aboutModalOpen);

    // Open modal automatically if EULA not accepted
    useEffect(() => {
        if (!accepted) {
            aboutModalOpen.next(true);
        }
    }, [accepted]);

    // Close modal when EULA is accepted
    useEffect(() => {
        if (accepted) {
            aboutModalOpen.next(false);
        }
    }, [accepted]);

    const handleCancel = () => {
        if (!accepted) {
            return;
        }
        aboutModalOpen.next(false);
    };

    return (
        <Modal
            title="About HytaleSource"
            closable={!!accepted}
            open={isModalOpen}
            onCancel={handleCancel}
            footer={null}
        >
            <Space direction="vertical" style={{ width: '100%' }}>
                <p>A decompiled source code viewer for Hytale. The Hytale server jar is downloaded from Hytale's public Maven repository.</p>
                <p>The <a href="https://github.com/Vineflower/vineflower">Vineflower</a> decompiler is used after being compiled to wasm as part of the <a href="https://www.npmjs.com/package/@run-slicer/vf">@run-slicer/vf</a> project.</p>

                <p style={{ fontSize: '0.9em', color: '#666' }}>
                    Forked from <a href="https://github.com/FabricMC/mcsrc">FabricMC/mcsrc</a> (Minecraft source viewer).
                </p>

                <Eula />
            </Space>
        </Modal>
    );
};

const Eula = () => {
    const accepted = useObservable(agreedEula.observable);

    if (accepted) {
        return <></>;
    }

    return (
        <Checkbox checked={agreedEula.value} onChange={e => {
            agreedEula.value = e.target.checked;
        }}>
            I understand that the decompiled source code is the property of Hypixel Studios and agree not to redistribute or share it. I agree to use this tool for educational purposes only.
        </Checkbox>);
};


export default AboutModal;
