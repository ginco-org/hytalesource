import { Alert, Button, Checkbox, Modal, Space, Typography } from "antd";
import { useEffect } from "react";
import { agreedEula } from "../logic/Settings";
import { InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { useObservable } from "../utils/UseObservable";
import { BehaviorSubject } from "rxjs";
import { needsAuth, initiateLogin, deviceAuthState, authError, cancelLogin } from "../logic/HytaleApi";

const { Text, Link } = Typography;

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
    const authRequired = useObservable(needsAuth);
    const deviceAuth = useObservable(deviceAuthState);
    const error = useObservable(authError);

    // Open modal automatically if EULA not accepted or authentication required
    useEffect(() => {
        if (!accepted || authRequired) {
            aboutModalOpen.next(true);
        }
    }, [authRequired, accepted]);

    // Close modal only when EULA is accepted AND no auth required
    useEffect(() => {
        if (accepted && !authRequired) {
            aboutModalOpen.next(false);
        }
    }, [accepted, authRequired]);

    const handleCancel = () => {
        if (!accepted) {
            return;
        }
        cancelLogin();
        aboutModalOpen.next(false);
    };

    const handleLogin = () => {
        if (accepted) {
            initiateLogin('release');
        }
    };

    const handleCancelLogin = () => {
        cancelLogin();
    };

    return (
        <Modal
            title="About HytaleSource"
            closable={accepted && !deviceAuth}
            open={isModalOpen}
            onCancel={handleCancel}
            footer={null}
        >
            <Space direction="vertical" style={{ width: '100%' }}>
                <p>A decompiled source code viewer for Hytale. The Hytale server jar is downloaded directly from Hypixel Studios' servers to your browser after authentication.</p>
                <p>The <a href="https://github.com/Vineflower/vineflower">Vineflower</a> decompiler is used after being compiled to wasm as part of the <a href="https://www.npmjs.com/package/@run-slicer/vf">@run-slicer/vf</a> project.</p>

                <p style={{ fontSize: '0.9em', color: '#666' }}>
                    Forked from <a href="https://github.com/FabricMC/mcsrc">FabricMC/mcsrc</a> (Minecraft source viewer).
                </p>

                <Eula />

                {accepted && authRequired && !deviceAuth && (
                    <>
                        <p>The Hytale login is only used to get permission to download the server jar directly from Hypixel Studios' servers.</p>
                        {error && <Alert type="error" message={error} style={{ marginBottom: 8 }} />}
                        <Button type="primary" block onClick={handleLogin}>
                            Login with Hytale Account
                        </Button>
                    </>
                )}

                {deviceAuth && (
                    <div style={{ textAlign: 'center', padding: '16px 0' }}>
                        <p><LoadingOutlined spin /> Waiting for authorization...</p>
                        <p>
                            Go to <Link href={deviceAuth.verificationUriComplete || deviceAuth.verificationUri} target="_blank">
                                {deviceAuth.verificationUri}
                            </Link>
                        </p>
                        <p>
                            and enter the code: <Text strong copyable style={{ fontSize: '1.2em' }}>{deviceAuth.userCode}</Text>
                        </p>
                        <Button onClick={handleCancelLogin} style={{ marginTop: 16 }}>
                            Cancel
                        </Button>
                    </div>
                )}
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
            I agree to use this tool for educational purposes only and understand that I need a valid Hytale account to access the server files.
        </Checkbox>);
};


export default AboutModal;
